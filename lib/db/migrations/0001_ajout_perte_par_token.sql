ALTER TABLE `tokens` ADD `perte_rug` real;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `default_stop_loss`;--> statement-breakpoint
ALTER TABLE `wallets` DROP COLUMN `stop_loss`;