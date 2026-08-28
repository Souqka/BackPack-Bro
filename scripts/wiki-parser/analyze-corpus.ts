/**
 * Корпусный анализ шаблона {{Item}} по всей базе Wiki.
 * Собирает уникальные триггеры, эффекты и star-фразы из wikitext,
 * до того как проектируется строгая модель Effect/Trigger.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { WikiFetcher } from "./fetcher.ts";
import { parseEffectPhrase } from "./parsers/effects.ts";
import { parseTrigger } from "./parsers/triggers.ts";
import { flattenWikitext, param, parseItemTemplate } from "./utils/wikitext.ts";

interface Counts {
  [key: string]: number;
}

function add(map: Counts, key: string): void {
  const k = key.trim();
  if (!k) return;
  map[k] = (map[k] ?? 0) + 1;
}

function top(map: Counts, n = 80): Array<[string, number]> {
  return Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

function generalize(text: string): string {
  return text
    .replace(/\d+(?:\.\d+)?%/g, "{pct}")
    .replace(/\d+(?:\.\d+)?/g, "{n}")
    .replace(/\s+/g, " ")
    .trim();
}

async function main(): Promise<void> {
  const fetcher = new WikiFetcher(20);
  const listed = await fetcher.listItems();
  console.log(`[INFO] Страниц в Cargo: ${listed.length}`);

  const titles = listed.map((e) => e.title);
  const wikitext = await fetcher.fetchWikitextBatch(titles);
  console.log(`[INFO] Получен wikitext: ${wikitext.size}`);

  const triggers: Counts = {};
  const effects: Counts = {};
  const effectPatterns: Counts = {};
  const levelTriggers: Counts = {};
  const levelEffects: Counts = {};
  const starPhrases: Counts = {};
  const constraintCandidates: Counts = {};
  const statuses: Counts = {};
  let itemsWithTemplate = 0;
  let itemsWithoutTemplate = 0;
  let triggerTotal = 0;
  let triggerNormalized = 0;
  let effectTotal = 0;
  let effectNormalized = 0;
  let constraintTotal = 0;
  let constraintNormalized = 0;
  const rawTriggers: Counts = {};
  const rawEffects: Counts = {};

  const statusLike =
    /\b(Armor|Mana|Health|Stamina|Luck|Bleed|Poison|Blind|Thorns|Burn|Chill|Haste|Regen|Resist|Dodge|Accuracy|Damage|Crit Chance|Crit Damage|Empower|Lifesteal|Fatigue|Insanity|Curse|Buff|Debuff|Max Health|Cooldown)\b/gi;

  for (const [title, wt] of wikitext) {
    const params = parseItemTemplate(wt);
    if (Object.keys(params).length === 0) {
      itemsWithoutTemplate += 1;
      continue;
    }
    itemsWithTemplate += 1;

    for (let n = 1; n <= 5; n++) {
      const trigger = flattenWikitext(param(params, `ability${n}Trigger`));
      if (trigger) {
        add(triggers, trigger);
        triggerTotal += 1;
        const parsedT = parseTrigger(trigger);
        if (parsedT.trigger && parsedT.trigger.type !== "raw") triggerNormalized += 1;
        else add(rawTriggers, trigger);
      }
      if (/\bstar\b/i.test(trigger)) add(starPhrases, `trigger: ${trigger}`);

      for (let e = 1; e <= 7; e++) {
        const effect = flattenWikitext(param(params, `ability${n}Effect${e}`));
        if (!effect) continue;
        add(effects, effect);
        add(effectPatterns, generalize(effect));
        effectTotal += 1;
        const parsedE = parseEffectPhrase(effect);
        if (parsedE.constraint) {
          constraintTotal += 1;
          if (parsedE.constraint.type !== "raw") constraintNormalized += 1;
        } else if (!parsedE.unparsed) {
          effectNormalized += 1;
        } else {
          add(rawEffects, generalize(effect));
        }
        if (/\bstar\b/i.test(effect)) add(starPhrases, `effect: ${effect}`);
        if (!trigger) add(constraintCandidates, effect);
        for (const m of effect.matchAll(statusLike)) {
          add(statuses, m[1] ?? "");
        }
      }
    }

    const lt = flattenWikitext(param(params, "levelUpAbilityTrigger"));
    if (lt) add(levelTriggers, lt);
    const le = flattenWikitext(param(params, "levelUpAbilityEffect"));
    if (le) {
      add(levelEffects, le);
      add(effectPatterns, `levelUpAbilityEffect: ${generalize(le)}`);
    }
  }

  const report = {
    itemsListed: listed.length,
    wikitextPages: wikitext.size,
    itemsWithTemplate,
    itemsWithoutTemplate,
    uniqueTriggers: Object.keys(triggers).length,
    uniqueEffects: Object.keys(effects).length,
    uniqueEffectPatterns: Object.keys(effectPatterns).length,
    coverage: {
      triggers: { total: triggerTotal, normalized: triggerNormalized },
      effects: { total: effectTotal, normalized: effectNormalized },
      constraints: { total: constraintTotal, normalized: constraintNormalized },
    },
    rawTriggers: top(rawTriggers, 80),
    rawEffectPatterns: top(rawEffects, 80),
    triggers: top(triggers, 200),
    effectPatterns: top(effectPatterns, 250),
    effectsSample: top(effects, 120),
    levelTriggers: top(levelTriggers, 80),
    levelEffects: top(levelEffects, 80),
    starPhrases: top(starPhrases, 200),
    constraintCandidates: top(constraintCandidates, 80),
    statuses: top(statuses, 80),
  };

  const outDir = path.join(process.cwd(), "data", "analysis");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "wikitext-corpus.json"), JSON.stringify(report, null, 2) + "\n");

  console.log("\n=== Triggers ===");
  for (const [k, n] of report.triggers) console.log(`${n}\t${k}`);
  console.log("\n=== Effect patterns ===");
  for (const [k, n] of report.effectPatterns.slice(0, 80)) console.log(`${n}\t${k}`);
  console.log("\n=== Star phrases ===");
  for (const [k, n] of report.starPhrases.slice(0, 60)) console.log(`${n}\t${k}`);
  console.log("\n=== Constraint candidates (no trigger) ===");
  for (const [k, n] of report.constraintCandidates) console.log(`${n}\t${k}`);
  console.log("\n=== Status-like tokens ===");
  for (const [k, n] of report.statuses) console.log(`${n}\t${k}`);
  console.log("\n=== Level-up triggers ===");
  for (const [k, n] of report.levelTriggers) console.log(`${n}\t${k}`);
  console.log("\n=== Покрытие нормализации ===");
  const c = report.coverage;
  console.log(`Triggers: ${c.triggers.normalized}/${c.triggers.total}`);
  console.log(`Effects: ${c.effects.normalized}/${c.effects.total}`);
  console.log(`Constraints: ${c.constraints.normalized}/${c.constraints.total}`);
  console.log("\n=== Triggers raw ===");
  for (const [k, n] of report.rawTriggers.slice(0, 25)) console.log(`${n}\t${k}`);
  console.log("\n=== Effect patterns raw ===");
  for (const [k, n] of report.rawEffectPatterns.slice(0, 25)) console.log(`${n}\t${k}`);
}

main().catch((err: unknown) => {
  console.error("[ERROR]", err);
  process.exit(1);
});
