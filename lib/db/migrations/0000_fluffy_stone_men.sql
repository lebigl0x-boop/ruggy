CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`sol_price_eur` real,
	`default_mise` real DEFAULT 0.1 NOT NULL,
	`default_objectif` real DEFAULT 100 NOT NULL,
	`default_stop_loss` real DEFAULT 30 NOT NULL,
	`default_perte_rug` real DEFAULT 90 NOT NULL,
	`default_frais` real DEFAULT 0.003 NOT NULL,
	`default_taux_vise` real DEFAULT 30 NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text,
	`mint` text,
	`gain` real,
	`fast` integer DEFAULT false NOT NULL,
	`delay` real,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tokens_wallet_position_idx` ON `tokens` (`wallet_id`,`position`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`address` text NOT NULL,
	`role` text DEFAULT 'dev' NOT NULL,
	`analyzed_at` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`tag_override` text,
	`mise` real DEFAULT 0.1 NOT NULL,
	`objectif` real DEFAULT 100 NOT NULL,
	`stop_loss` real DEFAULT 30 NOT NULL,
	`perte_rug` real DEFAULT 90 NOT NULL,
	`frais` real DEFAULT 0.003 NOT NULL,
	`taux_vise` real DEFAULT 30 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallets_address_unique` ON `wallets` (`address`);--> statement-breakpoint
CREATE INDEX `wallets_analyzed_at_idx` ON `wallets` (`analyzed_at`);