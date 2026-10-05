CREATE TABLE `wallet_days` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet_id` text NOT NULL,
	`day` text NOT NULL,
	`state` text DEFAULT 'actif' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_days_unique` ON `wallet_days` (`wallet_id`,`day`);--> statement-breakpoint
ALTER TABLE `tokens` ADD `phase` text DEFAULT 'screening' NOT NULL;--> statement-breakpoint
ALTER TABLE `tokens` ADD `day_id` text REFERENCES wallet_days(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `tokens_day_idx` ON `tokens` (`day_id`);--> statement-breakpoint
ALTER TABLE `wallets` ADD `status` text DEFAULT 'screening' NOT NULL;--> statement-breakpoint
ALTER TABLE `wallets` ADD `test_started_at` text;--> statement-breakpoint
CREATE INDEX `wallets_status_idx` ON `wallets` (`status`);