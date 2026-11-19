ALTER TABLE `gift_orders` MODIFY COLUMN `event_id` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `gifts` MODIFY COLUMN `event_id` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `guests` MODIFY COLUMN `event_id` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` MODIFY COLUMN `event_id` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` MODIFY COLUMN `event_id` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` MODIFY COLUMN `event_id` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `rsvp_logs` MODIFY COLUMN `event_id` bigint unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `rsvp_reminders` MODIFY COLUMN `event_id` bigint unsigned NOT NULL;