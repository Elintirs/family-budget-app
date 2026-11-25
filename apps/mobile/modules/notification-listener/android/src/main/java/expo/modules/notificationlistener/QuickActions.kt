package expo.modules.notificationlistener

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * Тихое уведомление после покупки с кнопками подкатегорий. Кнопка срабатывает и на заблокированном
 * экране: выбор пишется в SQLite (quick_choices), приложение применит его при следующем разборе.
 */
object QuickActions {
  private const val CHANNEL = "budget_quick"
  const val ACTION = "ru.familybudget.QUICK_CATEGORY"
  const val EXTRA_ID = "capturedId"
  const val EXTRA_SUB = "subcategory"

  private val AMOUNT = Regex("""(\d[\d\s  ]*(?:[.,]\d{1,2})?)\s?(?:₽|руб\.?|RUB|р\.|р(?![а-яёa-z]))""", RegexOption.IGNORE_CASE)

  fun ensureTable(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE IF NOT EXISTS quick_choices (captured_id TEXT PRIMARY KEY NOT NULL, subcategory TEXT NOT NULL, at INTEGER NOT NULL)")
  }

  /** Сумма в копейках и текст после неё (как магазин в универсальном разборе). */
  fun parse(title: String, text: String): Pair<Long, String>? {
    val full = "$title\n$text"
    val m = AMOUNT.find(full) ?: return null
    val raw = m.groupValues[1].replace(Regex("""[\s  ]"""), "").replace(',', '.')
    val kop = Math.round((raw.toDoubleOrNull() ?: return null) * 100)
    val tail = full.substring(m.range.last + 1).trimStart(' ', ',', '.', ':', ';', '-', '–', '—').trim()
    // Как в ядре: до конца строки, без «счет карты *1101.»; если сразу цифры (дата у Mir Pay), магазина нет.
    val line = tail.substringBefore('\n').replace(Regex("^(?:сч[её]т\\s+)?карт[аыу]?\\s*\\*?\\d{4}\\.?\\s*", RegexOption.IGNORE_CASE), "").trim()
    return kop to (if (line.firstOrNull()?.isDigit() == true) "" else line)
  }

  /** Ключ магазина: как merchantKey в core (до точки/запятой, буквы, первые два слова). */
  fun merchantKey(merchant: String): String? {
    val head = merchant.split(Regex("[.,;\n]")).first()
    val words = head.lowercase().replace('ё', 'е').replace(Regex("[^a-zа-я\\s]"), " ").split(Regex("\\s+")).filter { it.length > 1 }
    return if (words.isEmpty()) null else words.take(2).joinToString(" ")
  }

  private fun isDebit(full: String) = !Regex("(пополнени|зачислени|поступлени|перевод от|возврат|кэшбэк|зарплат)", RegexOption.IGNORE_CASE).containsMatchIn(full)

  /** Сумма с копейками, если они есть: «364,95 ₽», «523 ₽». */
  fun formatRubExact(kop: Long): String {
    val abs = Math.abs(kop)
    val rub = String.format("%,d", abs / 100).replace(',', ' ')
    val k = abs % 100
    return (if (kop < 0) "−" else "") + rub + (if (k != 0L) "," + String.format("%02d", k) else "") + " ₽"
  }

  fun formatRub(kop: Long): String {
    val rub = Math.round(kop / 100.0)
    val abs = String.format("%,d", Math.abs(rub)).replace(',', ' ')
    return (if (rub < 0) "−" else "") + abs + " ₽"
  }

  /** Подкатегории для кнопок: по магазину (правила и история) + частые, не больше трёх. */
  private fun suggestions(context: Context, key: String?): List<String> {
    val json = Store.prefs(context).getString("suggestions", null) ?: return emptyList()
    val o = JSONObject(json)
    val out = linkedSetOf<String>()
    if (key != null) o.optJSONObject("byMerchant")?.optJSONArray(key)?.let { a -> for (i in 0 until a.length()) out.add(a.getString(i)) }
    o.optJSONArray("frequent")?.let { a -> for (i in 0 until a.length()) out.add(a.getString(i)) }
    return out.take(3)
  }

  fun onCaptured(context: Context, capturedId: String, label: String, title: String, text: String) {
    val parsed = parse(title, text)
    if (parsed == null) {
      Store.logj(context, "warn", "quick", "Сумма не разобрана, кнопки не показаны", "captured" to capturedId, "label" to label)
      return
    }
    val (amount, parsedMerchant) = parsed
    // Яндекс Go: «Оцените поездку» не магазин, магазин это сам сервис.
    val merchant = if (label in Store.SERVICES) label else parsedMerchant
    val debit = isDebit("$title\n$text")
    Store.logj(context, "info", "quick", "Разбор для кнопок", "captured" to capturedId, "amount" to amount, "merchant" to merchant,
      "merchantKey" to merchantKey(merchant), "debit" to debit)
    Widgets.onPurchase(context, if (debit) amount else 0)
    if (!debit) {
      Store.logj(context, "info", "quick", "Не списание, кнопки не нужны", "captured" to capturedId)
      return
    }
    if (!Store.prefs(context).getBoolean("quickActions", true)) {
      Store.logj(context, "info", "quick", "Кнопки выключены в настройках", "captured" to capturedId)
      return
    }
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      Store.logj(context, "warn", "quick", "Нет разрешения на уведомления, кнопки не показаны", "captured" to capturedId)
      return
    }

    val card = Regex("""(?:[•*·]\s?){2,}(\d{4})""").find("$title\n$text")?.groupValues?.get(1)
    show(context, capturedId, if (merchant.isBlank() && card != null) "$label · •••• $card" else label, merchant, amount)
  }

  /** Проверка из онбординга: то же уведомление с кнопками, но без операции и без вычета из остатка. */
  fun showTest(context: Context): Boolean {
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) return false
    show(context, TEST_ID, "Проверка", "Проверка связи", 100)
    Store.log(context, "info", "quick", "Показано тестовое уведомление")
    return true
  }

  const val TEST_ID = "test"

  private fun show(context: Context, capturedId: String, label: String, merchant: String, amount: Long) {
    val nm = context.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL, "Категория после покупки", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "Кнопки подкатегорий сразу после оплаты"
          setSound(null, null)
          enableVibration(false)
          lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        },
      )
    }
    // Mir Pay не присылает магазин: тогда заголовок «Покупка», а карта в подписи (label).
    val shortMerchant = merchant.split(Regex("[.,;\n]")).first().trim().ifBlank { "Покупка" }
    val notifId = capturedId.hashCode()
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, notifId, it.setData(android.net.Uri.parse("budget://inbox")), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val subs = suggestions(context, merchantKey(merchant))
    val today = Widgets.today(context)
    val sub = label + when {
      today == null -> " · выбери категорию"
      today.over -> " · перерасход ${formatRub(-today.remaining)}"
      else -> " · на сегодня осталось ${formatRub(today.remaining)}"
    }
    val amountText = "−${formatRubExact(amount).removePrefix("−")}"

    // Своё содержимое по макету: магазин и сумма, остаток на сегодня, кнопки-«пилюли» 2×2. Шапка остаётся системной.
    fun views(layout: Int) = RemoteViews(context.packageName, layout).apply {
      setTextViewText(R.id.n_merchant, shortMerchant)
      setTextViewText(R.id.n_sub, sub)
      setImageViewBitmap(R.id.n_amount_light, numberBitmap(context, amountText, color(context, R.color.w_ink, night = false)))
      setImageViewBitmap(R.id.n_amount_dark, numberBitmap(context, amountText, color(context, R.color.w_ink, night = true)))
    }
    val small = views(R.layout.notif_quick_small)
    val big = views(R.layout.notif_quick_big).apply {
      for ((i, id) in listOf(R.id.n_b0, R.id.n_b1, R.id.n_b2).withIndex()) {
        val name = subs.getOrNull(i)
        if (name == null) {
          setViewVisibility(id, android.view.View.INVISIBLE)
          continue
        }
        setTextViewText(id, name)
        val intent = Intent(context, QuickActionReceiver::class.java).setAction(ACTION).putExtra(EXTRA_ID, capturedId).putExtra(EXTRA_SUB, name).putExtra("notifId", notifId)
        setOnClickPendingIntent(id, PendingIntent.getBroadcast(context, notifId * 10 + i, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
      }
      // «Все категории…»: сразу выбор категории для этой покупки.
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
        val uri = android.net.Uri.parse("budget://inbox?pick=$capturedId")
        setOnClickPendingIntent(R.id.n_more, PendingIntent.getActivity(context, notifId * 10 + 7, it.setData(uri), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
      }
    }
    val b = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_budget_notif)
      // Текст для часов, Android Auto и случаев, где своё содержимое не показывают.
      .setContentTitle("$shortMerchant · $amountText")
      .setContentText(sub)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(small)
      .setCustomBigContentView(big)
      .setCustomHeadsUpContentView(big)
      .setColor(context.getColor(R.color.w_accent))
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true)
      .setAutoCancel(true)
      .setContentIntent(open)
      // Своя группа: без неё Android складывает покупку с закреплённым остатком в «Бюджет 2» и прячет кнопки.
      .setGroup("budget_quick")
    NotificationManagerCompat.from(context).notify(notifId, b.build())
    trimOld(context, notifId)
    val byMerchant = merchantKey(merchant)?.let { k ->
      Store.prefs(context).getString("suggestions", null)?.let { JSONObject(it).optJSONObject("byMerchant")?.optJSONArray(k)?.length() } } ?: 0
    Store.logj(context, "info", "quick", "Показаны кнопки: ${subs.joinToString()}", "captured" to capturedId, "notifId" to notifId,
      "title" to "$shortMerchant · ${formatRub(amount)}", "buttons" to subs, "fromMerchant" to byMerchant,
      "suggestionsReady" to Store.prefs(context).contains("suggestions"))
  }
}

/**
 * В шторке держим только последнюю покупку: новые Android сворачивают уже два уведомления в группу
 * и прячет кнопки. Старые покупки остаются во «Входящих» приложения.
 */
private fun trimOld(context: Context, newest: Int) {
  val prefs = Store.prefs(context)
  val ids = (prefs.getString("quickIds", "") ?: "").split(',').filter { it.isNotBlank() }.map { it.toInt() }.filter { it != newest } + newest
  val keep = ids.takeLast(1)
  val drop = ids.dropLast(1)
  for (id in drop) NotificationManagerCompat.from(context).cancel(id)
  prefs.edit().putString("quickIds", keep.joinToString(",")).apply()
  if (drop.isNotEmpty()) Store.logj(context, "info", "quick", "Старые уведомления с кнопками убраны", "dropped" to drop.size)
}

class QuickActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(QuickActions.EXTRA_ID) ?: return
    val sub = intent.getStringExtra(QuickActions.EXTRA_SUB)
    NotificationManagerCompat.from(context).cancel(intent.getIntExtra("notifId", 0))
    if (id == QuickActions.TEST_ID) {
      Store.log(context, "info", "quick", "Проверка: кнопка в уведомлении работает", sub)
      return
    }
    if (sub == null) return
    val db = Store.open(context)
    QuickActions.ensureTable(db)
    db.insertWithOnConflict(
      "quick_choices",
      null,
      ContentValues().apply {
        put("captured_id", id)
        put("subcategory", sub)
        put("at", System.currentTimeMillis())
      },
      SQLiteDatabase.CONFLICT_REPLACE,
    )
    val km = context.getSystemService(android.app.KeyguardManager::class.java)
    Store.logj(context, "info", "quick", "Нажата кнопка: $sub", "captured" to id, "locked" to km?.isKeyguardLocked)
    // Операция стала размеченной: пусть уйдёт в таблицу сейчас, а не при следующем открытии.
    SendKick.kick(context, "кнопка $sub")
  }
}
