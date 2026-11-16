ALTER TABLE `guests` ADD `is_plus_one` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `contact_email` varchar(191);--> statement-breakpoint
ALTER TABLE `invitations` ADD `contact_phone` varchar(32);