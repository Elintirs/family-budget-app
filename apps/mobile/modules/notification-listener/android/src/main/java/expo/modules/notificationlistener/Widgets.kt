package expo.modules.notificationlistener

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.time.LocalDateTime

/**
 * Виджеты на рабочий стол. Цифры готовит приложение (setWidgetState), а новая покупка из пуша
 * сразу вычитается из остатка на день здесь, без открытия приложения.
 */
object Widgets {
  private const val KEY = "widgetState"

  fun state(context: Context): JSONObject = JSONObject(Store.prefs(context).getString(KEY, null) ?: "{}")

  fun save(context: Context, json: String) {
    if (Store.prefs(context).getString(KEY, null) == json) return
    Store.prefs(context).edit().putString(KEY, json).apply()
    Store.log(context, "info", "widget", "Состояние из приложения", json)
    updateAll(context)
  }

  /** Бюджетный день начинается в 05:00, как в таблице. */
  private fun budgetDay(): String = LocalDateTime.now().minusHours(5).toLocalDate().toString()

  fun onPurchase(context: Context, amountKop: Long) {
    val s = state(context)
    if (!s.has("day")) {
      Store.log(context, "info", "widget", "Покупка не учтена: приложение ещё не передало состояние")
      return
    }
    val before = s.optLong("remainingToday")
    val today = s.optString("day") == budgetDay()
    s.put("pending", s.optInt("pending") + 1)
    if (amountKop > 0 && today) {
      s.put("spentToday", s.optLong("spentToday") + amountKop)
      s.put("remainingToday", before - amountKop)
    }
    Store.prefs(context).edit().putString(KEY, s.toString()).apply()
    Store.logj(context, "info", "widget", "Покупка из пуша в виджете", "amount" to amountKop, "before" to before,
      "after" to s.optLong("remainingToday"), "stateDay" to s.optString("day"), "today" to budgetDay(), "pending" to s.optInt("pending"))
    updateAll(context)
  }

  class Today(val remaining: Long, val spent: Long, val limit: Long, val pct: Int, val pending: Int) {
    val over get() = remaining < 0
  }

  /** Цифры на сегодня из состояния; null, пока приложение ни разу не передало данные. */
  fun today(context: Context): Today? {
    val s = state(context)
    if (!s.has("day")) return null
    val fresh = s.optString("day") == budgetDay()
    val remaining = if (fresh) s.optLong("remainingToday") else s.optLong("dailyLimit")
    val spent = if (fresh) s.optLong("spentToday") else 0L
    val limit = s.optLong("dailyLimit")
    val pct = if (limit > 0) ((spent * 100) / limit).toInt().coerceIn(0, 100) else 0
    return Today(remaining, spent, limit, if (remaining < 0) 100 else pct, s.optInt("pending"))
  }

  fun updateAll(context: Context) {
    LockStatus.update(context)
    val mgr = AppWidgetManager.getInstance(context)
    val placed = mutableListOf<String>()
    for (cls in listOf(BudgetWidgetLarge::class.java, BudgetWidgetToday::class.java, BudgetWidgetMoney::class.java)) {
      val ids = mgr.getAppWidgetIds(ComponentName(context, cls))
      if (ids.isNotEmpty()) {
        mgr.updateAppWidget(ids, views(context, cls))
        placed += "${cls.simpleName}×${ids.size}"
      }
    }
    Store.logj(context, "info", "widget", "Виджеты обновлены", "placed" to placed)
  }

  private fun link(context: Context, uri: String, code: Int): PendingIntent {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)!!.setData(Uri.parse(uri))
    return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun views(context: Context, cls: Class<*>): RemoteViews {
    val s = state(context)
    val fresh = s.optString("day") == budgetDay()
    // Новый день, а приложение ещё не открывали: показываем лимит на день как остаток.
    val remaining = if (fresh) s.optLong("remainingToday") else s.optLong("dailyLimit")
    val spent = if (fresh) s.optLong("spentToday") else 0L
    val limit = s.optLong("dailyLimit")
    val over = remaining < 0
    val pct = if (limit > 0) ((spent * 100) / limit).toInt().coerceIn(0, 100) else 0
    val pending = s.optInt("pending")
    val noData = !s.has("day")
    val rub = QuickActions::formatRub
    val spentLine = "Потрачено ${rub(spent)} из ${rub(limit)}" + if (over) " · перерасход ${rub(-remaining)}" else ""

    fun RemoteViews.bars() {
      setProgressBar(R.id.w_progress, 100, pct, false)
      setProgressBar(R.id.w_progress_over, 100, 100, false)
      setViewVisibility(R.id.w_progress, if (over) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.w_progress_over, if (over) View.VISIBLE else View.GONE)
    }
    fun RemoteViews.captionColor(id: Int, normal: Int, warn: Int) {
      val res = if (over) warn else normal
      // С Android 12 цвет ресурсом: сам переключится вместе с темой.
      if (Build.VERSION.SDK_INT >= 31) setColorStateList(id, "setTextColor", res) else setTextColor(id, context.getColor(res))
    }
    /** Число картинкой шрифтом Unbounded: лаунчеры не берут шрифты приложения, а картинка ещё и сама вписывается в ширину. */
    fun RemoteViews.number(text: String, normal: Int, warn: Int) {
      val res = if (over && text != "—") warn else normal
      setImageViewBitmap(R.id.w_num_light, numberBitmap(context, text, color(context, res, night = false)))
      setImageViewBitmap(R.id.w_num_dark, numberBitmap(context, text, color(context, res, night = true)))
    }

    return when (cls) {
      BudgetWidgetLarge::class.java -> RemoteViews(context.packageName, R.layout.widget_large).apply {
        number(if (noData) "—" else rub(remaining), R.color.w_ink, R.color.w_warn)
        setTextViewText(R.id.w_caption, if (noData) "Открой приложение" else "Можно сегодня")
        setTextViewText(R.id.w_pending, "$pending ждут отправки")
        setViewVisibility(R.id.w_pending, if (pending > 0) View.VISIBLE else View.GONE)
        setTextViewText(R.id.w_spent, if (noData) "" else spentLine)
        captionColor(R.id.w_spent, R.color.w_muted, R.color.w_warn)
        val days = s.optInt("daysLeft")
        setTextViewText(R.id.w_month, if (noData || !s.has("remainingMonth")) "" else "На месяц осталось ${rub(s.optLong("remainingMonth"))}" + if (days > 0) " · $days ${plural(days, "день", "дня", "дней")}" else "")
        bars()
        setOnClickPendingIntent(R.id.w_root, link(context, "budget://", 1))
        setOnClickPendingIntent(R.id.w_add, link(context, "budget://add", 2))
        setOnClickPendingIntent(R.id.w_inbox, link(context, "budget://inbox", 3))
      }
      BudgetWidgetToday::class.java -> RemoteViews(context.packageName, R.layout.widget_today).apply {
        setTextViewText(R.id.w_title, "Можно сегодня")
        number(if (noData) "—" else rub(remaining), R.color.w_hero_ink, R.color.w_hero_warn)
        setTextViewText(R.id.w_caption, if (noData) "Открой приложение" else "потрачено ${rub(spent)}\nлимит ${rub(limit)}")
        captionColor(R.id.w_caption, R.color.w_hero_accent, R.color.w_hero_warn)
        bars()
        setOnClickPendingIntent(R.id.w_root, link(context, "budget://", 4))
      }
      else -> RemoteViews(context.packageName, R.layout.widget_small).apply {
        setTextViewText(R.id.w_title, "На счетах")
        number(s.optString("money", "—"), R.color.w_ink, R.color.w_ink)
        setTextViewText(R.id.w_caption, s.optString("debt", "").let { if (it.isBlank()) "" else "долг $it" })
        setViewVisibility(R.id.w_bars, View.GONE)
        setOnClickPendingIntent(R.id.w_root, link(context, "budget://", 5))
      }
    }
  }
}

private fun plural(n: Int, one: String, few: String, many: String): String {
  val m10 = n % 10
  val m100 = n % 100
  return when {
    m10 == 1 && m100 != 11 -> one
    m10 in 2..4 && m100 !in 12..14 -> few
    else -> many
  }
}

internal fun color(context: Context, res: Int, night: Boolean): Int {
  val conf = android.content.res.Configuration(context.resources.configuration)
  conf.uiMode = (conf.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK.inv()) or
    (if (night) android.content.res.Configuration.UI_MODE_NIGHT_YES else android.content.res.Configuration.UI_MODE_NIGHT_NO)
  return context.createConfigurationContext(conf).getColor(res)
}

private var unbounded: android.graphics.Typeface? = null

/** Текст картинкой по точным границам глифов, высота ~120 px: ImageView (fitStart) масштабирует под место. */
internal fun numberBitmap(context: Context, text: String, color: Int): android.graphics.Bitmap {
  val face = unbounded ?: androidx.core.content.res.ResourcesCompat.getFont(context, R.font.unbounded_semibold).also { unbounded = it }
  val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
    typeface = face
    textSize = 120f
    this.color = color
  }
  // Высота по цифрам, а не по тексту: «1 008 ₽» и «—» стоят на одной линии.
  val digits = android.graphics.Rect().also { paint.getTextBounds("0123456789", 0, 10, it) }
  val w = Math.ceil(paint.measureText(text).toDouble()).toInt().coerceAtLeast(1)
  val h = digits.height() + 4
  val bmp = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
  android.graphics.Canvas(bmp).drawText(text, 0f, (-digits.top + 2).toFloat(), paint)
  return bmp
}

open class BudgetWidgetBase : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    manager.updateAppWidget(ids, Widgets.views(context, this::class.java))
  }

  override fun onEnabled(context: Context) {
    Store.log(context, "info", "widget", "Виджет добавлен: ${this::class.java.simpleName}")
  }

  override fun onDeleted(context: Context, ids: IntArray) {
    Store.log(context, "info", "widget", "Виджет удалён: ${this::class.java.simpleName}")
  }
}

class BudgetWidgetLarge : BudgetWidgetBase()
class BudgetWidgetToday : BudgetWidgetBase()
class BudgetWidgetMoney : BudgetWidgetBase()
