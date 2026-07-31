# Cosmetic architecture

Cosmetics have a typed catalogue, ownership grants, and one equipped item per
type. Supported types are profile accent, profile frame, result-card theme,
victory effect, and division-badge style. Seeded free items preserve the current
accents and provide a clean frame/card/badge.

Profile settings fetch only owned/available items and equip through a narrow
database function that verifies ownership and matching type. Cosmetics never
enter challenge generation, scoring, matchmaking, Elo, or season-point logic.

Grant sources support free, achievement, season, admin, and future purchase
records, but there is no payment provider, advertising, shop, random reward, loot
box, gambling mechanic, or pay-to-win behavior.
