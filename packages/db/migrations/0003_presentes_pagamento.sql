ALTER TABLE `gift_orders` ADD `method` enum('pix','card') DEFAULT 'pix' NOT NULL;--> statement-breakpoint
ALTER TABLE `gift_orders` ADD `provider` enum('simulado','mercadopago') DEFAULT 'simulado' NOT NULL;--> statement-breakpoint
ALTER TABLE `gift_orders` ADD `provider_order_id` varchar(128);--> statement-breakpoint
ALTER TABLE `gift_orders` ADD `status_detail` varchar(64);--> statement-breakpoint
ALTER TABLE `gift_orders` ADD `pix_code` text;--> statement-breakpoint
ALTER TABLE `gift_orders` ADD `pix_qr_base64` mediumtext;--> statement-breakpoint
ALTER TABLE `gift_orders` ADD `pix_ticket_url` varchar(255);--> statement-breakpoint
ALTER TABLE `messages` ADD `gift_order_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `gift_orders` ADD CONSTRAINT `gift_orders_provider_order_id_unique` UNIQUE(`provider_order_id`);--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_gift_order_id_unique` UNIQUE(`gift_order_id`);--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_gift_order_id_gift_orders_id_fk` FOREIGN KEY (`gift_order_id`) REFERENCES `gift_orders`(`id`) ON DELETE set null ON UPDATE no action;