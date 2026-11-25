// Точка входа. Фоновая задача объявляется здесь, до роутера: WorkManager (раз в 15 минут и будильник
// SendKick по пушу) поднимает JS без экрана, и корневой _layout тогда не выполняется. Без этого в
// «холодном» процессе было «No task registered for key expo-task-manager»: фон работал, только пока
// приложение живо в памяти (журнал Елены 11–12.10, Xiaomi: перерывы по 14 и 24 часа).
import './src/adapters/autoSend';
import 'expo-router/entry';
