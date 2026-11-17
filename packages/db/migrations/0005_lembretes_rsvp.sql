CREATE TABLE `rsvp_reminders` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`invitation_id` bigint unsigned NOT NULL,
	`kind` varchar(32) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `rsvp_reminders_id` PRIMARY KEY(`id`),
	CONSTRAINT `rsvp_reminders_invitation_kind_idx` UNIQUE(`invitation_id`,`kind`)
);
--> statement-breakpoint
ALTER TABLE `rsvp_reminders` ADD CONSTRAINT `rsvp_reminders_invitation_id_invitations_id_fk` FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON DELETE cascade ON UPDATE no action;