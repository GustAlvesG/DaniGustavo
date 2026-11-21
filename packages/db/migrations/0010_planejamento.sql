-- Fase 4 (gestão do evento: tarefas, fornecedores, contratos, orçamentos, parcelas, planejado ×
-- realizado e cronograma). Gerada pelo drizzle-kit e revisada: só cria tabelas e um índice único
-- em `events` (organization_id, id), alvo da FK composta de `event_vendors`; vale no MariaDB 10.4
-- e no MySQL 8 e não toca em dados existentes.
CREATE TABLE `budget_lines` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`category` varchar(32) NOT NULL,
	`planned_cents` int NOT NULL,
	`notes` varchar(300),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `budget_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `budget_lines_event_category_idx` UNIQUE(`event_id`,`category`)
);
--> statement-breakpoint
CREATE TABLE `event_tasks` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`title` varchar(191) NOT NULL,
	`description` text,
	`category` varchar(32) NOT NULL,
	`status` enum('todo','doing','done') NOT NULL DEFAULT 'todo',
	`assignee_user_id` varchar(36),
	`due_on` date,
	`due_offset_days` int,
	`template_item_id` bigint unsigned,
	`completed_at` datetime(3),
	`completed_by` varchar(36),
	`sort` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `event_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_tasks_event_id_id_idx` UNIQUE(`event_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `event_vendors` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`organization_id` bigint unsigned NOT NULL,
	`vendor_id` bigint unsigned NOT NULL,
	`category` varchar(32) NOT NULL,
	`status` enum('prospect','hired','dismissed') NOT NULL DEFAULT 'prospect',
	`notes` text,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `event_vendors_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_vendors_event_id_id_idx` UNIQUE(`event_id`,`id`),
	CONSTRAINT `event_vendors_event_vendor_idx` UNIQUE(`event_id`,`vendor_id`)
);
--> statement-breakpoint
CREATE TABLE `quote_installments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`quote_id` bigint unsigned NOT NULL,
	`number` int NOT NULL,
	`due_on` date NOT NULL,
	`amount_cents` int NOT NULL,
	`paid_at` datetime(3),
	`method` varchar(32),
	`notes` varchar(300),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `quote_installments_id` PRIMARY KEY(`id`),
	CONSTRAINT `quote_installments_event_quote_number_idx` UNIQUE(`event_id`,`quote_id`,`number`)
);
--> statement-breakpoint
CREATE TABLE `quote_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`quote_id` bigint unsigned NOT NULL,
	`description` varchar(300) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unit_cents` int NOT NULL,
	`sort` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `quote_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`event_vendor_id` bigint unsigned NOT NULL,
	`title` varchar(191) NOT NULL,
	`category` varchar(32) NOT NULL,
	`status` enum('draft','received','approved','contracted','declined') NOT NULL DEFAULT 'draft',
	`discount_cents` int NOT NULL DEFAULT 0,
	`total_cents` int NOT NULL DEFAULT 0,
	`valid_until` date,
	`received_at` datetime(3),
	`approved_at` datetime(3),
	`contracted_at` datetime(3),
	`declined_at` datetime(3),
	`notes` text,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `quotes_event_id_id_idx` UNIQUE(`event_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`starts_at` datetime(3) NOT NULL,
	`ends_at` datetime(3),
	`title` varchar(191) NOT NULL,
	`details` text,
	`location` varchar(191),
	`responsible` varchar(191),
	`event_vendor_id` bigint unsigned,
	`sort` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `schedule_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_template_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`organization_id` bigint unsigned NOT NULL,
	`template_id` bigint unsigned NOT NULL,
	`title` varchar(191) NOT NULL,
	`description` text,
	`category` varchar(32) NOT NULL,
	`offset_days` int NOT NULL,
	`sort` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `task_template_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_templates` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`organization_id` bigint unsigned NOT NULL,
	`name` varchar(191) NOT NULL,
	`event_type` varchar(32),
	`description` text,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `task_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_templates_org_id_id_idx` UNIQUE(`organization_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `vendor_contracts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`event_vendor_id` bigint unsigned NOT NULL,
	`title` varchar(191) NOT NULL,
	`file` varchar(191) NOT NULL,
	`original_name` varchar(191) NOT NULL,
	`mime` varchar(64) NOT NULL,
	`bytes` int unsigned NOT NULL,
	`signed_on` date,
	`notes` text,
	`uploaded_by` varchar(36),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `vendor_contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `vendor_contracts_event_file_idx` UNIQUE(`event_id`,`file`)
);
--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`organization_id` bigint unsigned NOT NULL,
	`name` varchar(191) NOT NULL,
	`category` varchar(32) NOT NULL,
	`contact_name` varchar(191),
	`email` varchar(191),
	`phone` varchar(32),
	`website` varchar(300),
	`document` varchar(14),
	`notes` text,
	`rating` int,
	`archived_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `vendors_id` PRIMARY KEY(`id`),
	CONSTRAINT `vendors_org_id_id_idx` UNIQUE(`organization_id`,`id`)
);
--> statement-breakpoint
ALTER TABLE `events` ADD CONSTRAINT `events_org_id_id_idx` UNIQUE(`organization_id`,`id`);--> statement-breakpoint
ALTER TABLE `budget_lines` ADD CONSTRAINT `budget_lines_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_tasks` ADD CONSTRAINT `event_tasks_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_tasks` ADD CONSTRAINT `event_tasks_assignee_user_id_user_id_fk` FOREIGN KEY (`assignee_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_tasks` ADD CONSTRAINT `event_tasks_completed_by_user_id_fk` FOREIGN KEY (`completed_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_vendors` ADD CONSTRAINT `event_vendors_event_fk` FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_vendors` ADD CONSTRAINT `event_vendors_vendor_fk` FOREIGN KEY (`organization_id`,`vendor_id`) REFERENCES `vendors`(`organization_id`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_installments` ADD CONSTRAINT `quote_installments_quote_fk` FOREIGN KEY (`event_id`,`quote_id`) REFERENCES `quotes`(`event_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_quote_fk` FOREIGN KEY (`event_id`,`quote_id`) REFERENCES `quotes`(`event_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_event_vendor_fk` FOREIGN KEY (`event_id`,`event_vendor_id`) REFERENCES `event_vendors`(`event_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_items` ADD CONSTRAINT `schedule_items_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_template_items` ADD CONSTRAINT `task_template_items_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_template_items` ADD CONSTRAINT `task_template_items_template_fk` FOREIGN KEY (`organization_id`,`template_id`) REFERENCES `task_templates`(`organization_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_templates` ADD CONSTRAINT `task_templates_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_contracts` ADD CONSTRAINT `vendor_contracts_uploaded_by_user_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_contracts` ADD CONSTRAINT `vendor_contracts_event_vendor_fk` FOREIGN KEY (`event_id`,`event_vendor_id`) REFERENCES `event_vendors`(`event_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendors` ADD CONSTRAINT `vendors_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `event_tasks_event_status_due_idx` ON `event_tasks` (`event_id`,`status`,`due_on`);--> statement-breakpoint
CREATE INDEX `event_vendors_org_vendor_idx` ON `event_vendors` (`organization_id`,`vendor_id`);--> statement-breakpoint
CREATE INDEX `quote_installments_event_due_idx` ON `quote_installments` (`event_id`,`due_on`);--> statement-breakpoint
CREATE INDEX `quote_items_event_quote_idx` ON `quote_items` (`event_id`,`quote_id`,`sort`);--> statement-breakpoint
CREATE INDEX `quotes_event_vendor_idx` ON `quotes` (`event_id`,`event_vendor_id`);--> statement-breakpoint
CREATE INDEX `quotes_event_status_idx` ON `quotes` (`event_id`,`status`);--> statement-breakpoint
CREATE INDEX `schedule_items_event_starts_idx` ON `schedule_items` (`event_id`,`starts_at`,`sort`);--> statement-breakpoint
CREATE INDEX `task_template_items_org_template_idx` ON `task_template_items` (`organization_id`,`template_id`,`sort`);--> statement-breakpoint
CREATE INDEX `vendor_contracts_event_vendor_idx` ON `vendor_contracts` (`event_id`,`event_vendor_id`);--> statement-breakpoint
CREATE INDEX `vendors_org_category_idx` ON `vendors` (`organization_id`,`category`);