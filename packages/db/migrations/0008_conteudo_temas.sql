-- Fase 2 (conteúdo, temas e vocabulário por tipo de evento). Escrita/revisada à mão:
-- vale no MariaDB 10.4 e no MySQL 8 e preserva os dados.
--
-- 1. `event_media`: fotos do evento (galeria e seções do site), com miniatura, legenda,
--    álbum e ordem. FK composta (event_id, id) única para tabelas filhas futuras.
CREATE TABLE `event_media` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`file` varchar(191) NOT NULL,
	`thumb_file` varchar(191),
	`mime` varchar(32) NOT NULL,
	`width` int unsigned NOT NULL,
	`height` int unsigned NOT NULL,
	`bytes` int unsigned NOT NULL,
	`alt` varchar(300) NOT NULL DEFAULT '',
	`caption` varchar(300) NOT NULL DEFAULT '',
	`album` varchar(64),
	`position` varchar(40),
	`in_gallery` boolean NOT NULL DEFAULT true,
	`sort` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `event_media_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_media_event_id_id_idx` UNIQUE(`event_id`,`id`),
	CONSTRAINT `event_media_event_file_idx` UNIQUE(`event_id`,`file`)
);
--> statement-breakpoint
ALTER TABLE `event_media` ADD CONSTRAINT `event_media_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `event_media_event_gallery_sort_idx` ON `event_media` (`event_id`,`in_gallery`,`sort`);--> statement-breakpoint
-- 2. `invitations.side`: enum('dani','gustavo') → varchar(32) com a chave do lado. O MODIFY
--    converte cada valor do enum no texto igual, então os convites existentes ficam como estão.
ALTER TABLE `invitations` MODIFY COLUMN `side` varchar(32) NOT NULL;--> statement-breakpoint
-- 3. Os lados viram configuração por evento (`event.sides`). Todo evento que já existe usava o
--    enum antigo, então recebe os dois lados com os rótulos de antes (o anfitrião renomeia no
--    painel). INSERT IGNORE + PK (event_id, key): rodar de novo não duplica nem sobrescreve.
INSERT IGNORE INTO `event_settings` (`event_id`, `key`, `value`, `is_public`, `created_at`, `updated_at`)
SELECT `id`, 'event.sides', '[{"key":"dani","label":"Dani"},{"key":"gustavo","label":"Gustavo"}]', false, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
FROM `events`;
