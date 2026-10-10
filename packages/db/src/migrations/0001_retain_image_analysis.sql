CREATE TABLE `image_analyses` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`content_hash` text NOT NULL,
	`caption` text NOT NULL,
	`caption_meta` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Preserve the original Utility provenance, including legacy unknown fields. No current model or
-- recipe is attributed to these rows. The reuse boundary validates the stored contract before use.
INSERT INTO image_analyses (asset_id, content_hash, caption, caption_meta, created_at)
SELECT asset_id, content_hash, caption, caption_meta, created_at FROM (
 SELECT i.*, row_number() OVER (PARTITION BY i.asset_id ORDER BY
  CASE WHEN i.generation_id = t.generation_id THEN 0 ELSE 1 END, i.created_at DESC, i.id) AS preference
 FROM image_embeddings i
 JOIN assets a ON a.id = i.asset_id AND a.hash = i.content_hash
 JOIN embed_generations g ON g.id = i.generation_id AND g.owner_id = a.owner_id
 LEFT JOIN embed_generation_targets t ON t.owner_id = a.owner_id AND t.task = 'imageEmbed'
 WHERE i.lens = 'image-captioned' AND length(trim(i.caption)) > 0
  AND json_valid(i.caption_meta) AND json_type(i.caption_meta) = 'object'
  AND (json_type(i.caption_meta, '$.artStyle') IS NULL OR (json_type(i.caption_meta, '$.artStyle') = 'text' AND json_extract(i.caption_meta, '$.artStyle') IN ('anime', 'semi-realistic', 'photorealistic', 'painterly', 'illustration', 'cartoon', 'pixel-art', '3d-render', 'sketch', 'comic', 'abstract', 'other')))
  AND (json_type(i.caption_meta, '$.palette') IS NULL OR (json_type(i.caption_meta, '$.palette') = 'text' AND json_extract(i.caption_meta, '$.palette') IN ('warm', 'cool', 'neutral', 'vibrant', 'muted', 'monochrome', 'pastel', 'dark', 'high-contrast')))
  AND (json_type(i.caption_meta, '$.mood') IS NULL OR (json_type(i.caption_meta, '$.mood') = 'text' AND json_extract(i.caption_meta, '$.mood') IN ('cheerful', 'serene', 'melancholic', 'menacing', 'sensual', 'playful', 'tense', 'wistful', 'triumphant', 'neutral')))
  AND (json_type(i.caption_meta, '$.rating') IS NULL OR (json_type(i.caption_meta, '$.rating') = 'text' AND json_extract(i.caption_meta, '$.rating') IN ('safe', 'suggestive', 'explicit')))
  AND (json_type(i.caption_meta, '$.shotType') IS NULL OR (json_type(i.caption_meta, '$.shotType') = 'text' AND json_extract(i.caption_meta, '$.shotType') IN ('portrait', 'bust', 'half-body', 'full-body', 'close-up', 'wide')))
  AND (json_type(i.caption_meta, '$.cameraAngle') IS NULL OR (json_type(i.caption_meta, '$.cameraAngle') = 'text' AND json_extract(i.caption_meta, '$.cameraAngle') IN ('eye-level', 'low-angle', 'high-angle', 'dutch', 'overhead', 'profile', 'from-behind')))
  AND (json_type(i.caption_meta, '$.gender') IS NULL OR (json_type(i.caption_meta, '$.gender') = 'text' AND json_extract(i.caption_meta, '$.gender') IN ('female', 'male', 'androgynous', 'non-human', 'group', 'none')))
  AND (json_type(i.caption_meta, '$.coverage') IS NULL OR (json_type(i.caption_meta, '$.coverage') = 'text' AND json_extract(i.caption_meta, '$.coverage') IN ('fully-covered', 'mostly-covered', 'partially-exposed', 'mostly-exposed', 'uncovered')))
  AND (json_type(i.caption_meta, '$.bodyType') IS NULL OR (json_type(i.caption_meta, '$.bodyType') = 'text' AND json_extract(i.caption_meta, '$.bodyType') IN ('slim', 'average', 'athletic', 'curvy', 'heavy', 'petite', 'muscular', 'non-human', 'not-applicable')))
  AND (json_type(i.caption_meta, '$.chestSize') IS NULL OR (json_type(i.caption_meta, '$.chestSize') = 'text' AND json_extract(i.caption_meta, '$.chestSize') IN ('flat', 'small', 'medium', 'large', 'very-large', 'not-applicable')))
  AND (json_type(i.caption_meta, '$.skinTone') IS NULL OR (json_type(i.caption_meta, '$.skinTone') = 'text' AND json_extract(i.caption_meta, '$.skinTone') IN ('pale', 'fair', 'tan', 'olive', 'brown', 'dark', 'non-human', 'not-applicable')))
  AND (json_type(i.caption_meta, '$.outfitType') IS NULL OR (json_type(i.caption_meta, '$.outfitType') = 'text' AND json_extract(i.caption_meta, '$.outfitType') IN ('casual', 'formal', 'armor', 'uniform', 'swimwear', 'lingerie', 'traditional', 'streetwear', 'fantasy', 'none', 'other')))
  AND (json_type(i.caption_meta, '$.clothingState') IS NULL OR (json_type(i.caption_meta, '$.clothingState') = 'text' AND json_extract(i.caption_meta, '$.clothingState') IN ('intact', 'disheveled', 'partially-removed', 'removed', 'not-applicable')))
  AND (json_type(i.caption_meta, '$.nudityLevel') IS NULL OR (json_type(i.caption_meta, '$.nudityLevel') = 'text' AND json_extract(i.caption_meta, '$.nudityLevel') IN ('none', 'suggestive', 'partial', 'full')))
  AND (json_type(i.caption_meta, '$.model') IS NULL OR json_type(i.caption_meta, '$.model') = 'text')
  AND (json_type(i.caption_meta, '$.exposedParts') IS NULL OR (json_type(i.caption_meta, '$.exposedParts') = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(i.caption_meta, '$.exposedParts') j WHERE j.type != 'text' OR j.value NOT IN ('shoulders', 'midriff', 'cleavage', 'back', 'legs', 'thighs', 'chest', 'buttocks', 'genitals', 'feet'))))
  AND (json_type(i.caption_meta, '$.tags') IS NULL OR (json_type(i.caption_meta, '$.tags') = 'array' AND json_array_length(i.caption_meta, '$.tags') BETWEEN 3 AND 8 AND NOT EXISTS (SELECT 1 FROM json_each(i.caption_meta, '$.tags') j WHERE j.type != 'text')))
) WHERE preference = 1;
--> statement-breakpoint
ALTER TABLE `image_embeddings` DROP COLUMN `caption`;--> statement-breakpoint
ALTER TABLE `image_embeddings` DROP COLUMN `caption_meta`;