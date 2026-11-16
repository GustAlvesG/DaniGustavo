CREATE TABLE `gift_orders` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`public_id` varchar(26) NOT NULL,
	`gift_id` bigint unsigned NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`amount_cents` int NOT NULL,
	`fee_cents` int NOT NULL DEFAULT 0,
	`fee_covered` boolean NOT NULL DEFAULT false,
	`buyer_name` varchar(191) NOT NULL,
	`buyer_email` varchar(191) NOT NULL,
	`message` text,
	`show_on_wall` boolean NOT NULL DEFAULT false,
	`status` enum('pending','paid','expired','failed','refunded') NOT NULL DEFAULT 'pending',
	`expires_at` datetime(3) NOT NULL,
	`paid_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `gift_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `gift_orders_public_id_unique` UNIQUE(`public_id`)
);
--> statement-breakpoint
CREATE TABLE `gifts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(191) NOT NULL,
	`title` varchar(191) NOT NULL,
	`description` text,
	`image` varchar(255),
	`price_cents` int NOT NULL,
	`open_amount` boolean NOT NULL DEFAULT false,
	`quota_total` int NOT NULL DEFAULT 1,
	`quota_sold` int NOT NULL DEFAULT 0,
	`category` varchar(64) NOT NULL,
	`tile_design` varchar(32) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`sort` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `gifts_id` PRIMARY KEY(`id`),
	CONSTRAINT `gifts_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `guests` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`invitation_id` bigint unsigned NOT NULL,
	`name` varchar(191) NOT NULL,
	`is_child` boolean NOT NULL DEFAULT false,
	`age_range` enum('0-2','3-7','8-12'),
	`rsvp_status` enum('pending','confirmed','declined') NOT NULL DEFAULT 'pending',
	`dietary_notes` text,
	`phone` varchar(32),
	`email` varchar(191),
	`responded_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `guests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`token` varchar(26) NOT NULL,
	`label` varchar(191) NOT NULL,
	`max_guests` int NOT NULL DEFAULT 1,
	`side` enum('dani','gustavo') NOT NULL,
	`allow_plus_one` boolean NOT NULL DEFAULT false,
	`sent_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitations_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`author` varchar(120) NOT NULL,
	`body` text NOT NULL,
	`approved` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`gateway` varchar(32) NOT NULL DEFAULT 'mercadopago',
	`gateway_id` varchar(128) NOT NULL,
	`method` enum('pix','card') NOT NULL,
	`gateway_status` varchar(32),
	`gross_cents` int NOT NULL,
	`fee_cents` int NOT NULL DEFAULT 0,
	`net_cents` int NOT NULL,
	`raw` json,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_gateway_id_unique` UNIQUE(`gateway_id`)
);
--> statement-breakpoint
CREATE TABLE `rsvp_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`invitation_id` bigint unsigned NOT NULL,
	`payload` json NOT NULL,
	`ip` varchar(45),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `rsvp_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(100) NOT NULL,
	`value` json NOT NULL,
	`is_public` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`gateway` varchar(32) NOT NULL DEFAULT 'mercadopago',
	`event_id` varchar(128) NOT NULL,
	`payload` json NOT NULL,
	`processed_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhook_events_event_id_unique` UNIQUE(`event_id`)
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` varchar(36) NOT NULL,
	`account_id` varchar(191) NOT NULL,
	`provider_id` varchar(64) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime(3),
	`refresh_token_expires_at` datetime(3),
	`scope` text,
	`password` text,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `account_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(36) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`token` varchar(191) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`ip_address` varchar(64),
	`user_agent` text,
	`user_id` varchar(36) NOT NULL,
	CONSTRAINT `session_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `two_factor` (
	`id` varchar(36) NOT NULL,
	`secret` text NOT NULL,
	`backup_codes` text NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`verified` boolean DEFAULT true,
	`failed_verification_count` int DEFAULT 0,
	`locked_until` datetime(3),
	CONSTRAINT `two_factor_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` varchar(36) NOT NULL,
	`name` varchar(191) NOT NULL,
	`email` varchar(191) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`two_factor_enabled` boolean DEFAULT false,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` varchar(36) NOT NULL,
	`identifier` varchar(191) NOT NULL,
	`value` text NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `gift_orders` ADD CONSTRAINT `gift_orders_gift_id_gifts_id_fk` FOREIGN KEY (`gift_id`) REFERENCES `gifts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guests` ADD CONSTRAINT `guests_invitation_id_invitations_id_fk` FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_order_id_gift_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `gift_orders`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rsvp_logs` ADD CONSTRAINT `rsvp_logs_invitation_id_invitations_id_fk` FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `account` ADD CONSTRAINT `account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `two_factor` ADD CONSTRAINT `two_factor_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `gift_orders_status_expires_idx` ON `gift_orders` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `gift_orders_gift_id_idx` ON `gift_orders` (`gift_id`);--> statement-breakpoint
CREATE INDEX `gifts_active_sort_idx` ON `gifts` (`active`,`sort`);--> statement-breakpoint
CREATE INDEX `guests_invitation_id_idx` ON `guests` (`invitation_id`);--> statement-breakpoint
CREATE INDEX `messages_approved_idx` ON `messages` (`approved`);--> statement-breakpoint
CREATE INDEX `payments_order_id_idx` ON `payments` (`order_id`);--> statement-breakpoint
CREATE INDEX `rsvp_logs_invitation_id_idx` ON `rsvp_logs` (`invitation_id`);--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `two_factor_user_id_idx` ON `two_factor` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);