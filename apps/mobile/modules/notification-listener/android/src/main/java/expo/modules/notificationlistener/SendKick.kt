package expo.modules.notificationlistener

import android.content.Context
import android.os.Build
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.ListenableWorker
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkInfo
import androidx.work.WorkManager
import java.util.concurrent.Executors

/**
 * Разбор и отправка сразу после пойманного пуша, а не по расписанию.
 *
 * Периодическая фоновая задача (expo-background-task, раз в 15 минут) на Xiaomi с Android 16 живёт,
 * пока приложение недавно открывали: журнал Елены 11–12.10 показал перерыв в сутки, при этом
 * слушатель уведомлений всё это время работал и ловил пуши. Поэтому будим ту же JS-задачу
 * (ingestPending + отправка размеченного) из слушателя: разовая работа WorkManager, при сети,
 * с воркером самого expo-background-task (по имени класса: модуль не отдельный gradle-проект).
 */
object SendKick {
  private const val NAME = "budget-send-kick"
  private const val EXPO_WORKER = "expo.modules.backgroundtask.BackgroundTaskWork"
  private val executor = Executors.newSingleThreadExecutor()

  fun kick(context: Context, reason: String) {
    val app = context.applicationContext
    executor.execute {
      try {
        val wm = WorkManager.getInstance(app)
        val states = wm.getWorkInfosForUniqueWork(NAME).get().map { it.state }
        // Одна в работе и одна в очереди: пачку пушей (банк + Mir Pay) разберёт один следующий запуск.
        if (states.any { it == WorkInfo.State.ENQUEUED || it == WorkInfo.State.BLOCKED }) return@execute
        @Suppress("UNCHECKED_CAST")
        val worker = Class.forName(EXPO_WORKER) as Class<out ListenableWorker>
        // appScopeKey: Expo регистрирует задачи под именем пакета приложения.
        val request = OneTimeWorkRequest.Builder(worker)
          .setInputData(Data.Builder().putString("appScopeKey", app.packageName).build())
          .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
          .apply {
            // До Android 12 срочная работа требует уведомления о фоновой работе: там обычная.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
              setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
          }
          .build()
        wm.enqueueUniqueWork(NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
        Store.log(app, "info", "sync", "Будим отправку: $reason", null)
      } catch (t: Throwable) {
        Store.log(app, "error", "sync", "Не удалось разбудить отправку", t.toString())
      }
    }
  }
}
