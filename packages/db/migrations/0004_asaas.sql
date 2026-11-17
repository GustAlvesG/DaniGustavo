ALTER TABLE `gift_orders` MODIFY COLUMN `provider` enum('simulado','asaas') NOT NULL DEFAULT 'simulado';--> statement-breakpoint
ALTER TABLE `payments` MODIFY COLUMN `gateway` varchar(32) NOT NULL DEFAULT 'simulado';--> statement-breakpoint
ALTER TABLE `webhook_events` MODIFY COLUMN `gateway` varchar(32) NOT NULL DEFAULT 'simulado';