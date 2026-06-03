/** Practical energy tips — one random entry shown on each page load. */
export const ENERGY_RECOMMENDATIONS: readonly string[] = [
  "Keep energy above 50%: it makes quests easier and cuts impulsive time waste.",
  "Schedule one heavy work block per day when your energy bar peaks. Everything else is routine and rest.",
  "7–8 hours of sleep is the cheapest energy bonus. Without it, hacks only work at half strength.",
  "If energy drops three days in a row, cut commitments by 20% and fix your sleep schedule.",
  "Water and a light snack before lunch often buy 1–2 productive hours without extra caffeine.",
  "A 20–30 minute walk restores focus better than another episode “for rest.”",
  "Mute notifications for 2 hours at peak energy — it protects your reserve like phone-free mode.",
  "Don't make important decisions on low evening energy — move them to the next morning.",
  "Break big tasks into 25-minute steps — less energy lost to procrastination.",
  "The ♻️ bonus makes sense on days you consciously recover, not when you're catching up.",
  "After 💊 you're in heightened loss mode: plan fewer obligations and more sleep for at least 2–3 days.",
  "Review Spent and Gained once a week — it's a mirror of habits, not a punishment.",
  "Energy at week start is your baseline. If you're down 40% by Friday, take real rest on the weekend.",
  "Two short breaks beat one long one: your brain doesn't freeze in fatigue as easily.",
  "Exercises in the frame aren't punishment. Check off only what you actually did.",
  "Don't hoard empty exercise slots: 3–4 realistic goals beat six ambitious ones.",
  "Morning light and a fixed wake time stabilize energy more than random naps.",
  "If energy is below 30%, cancel optional meetings — or pay double the price tomorrow.",
  "A couple of social contacts per week supports motivation; too many drain your reserve.",
  "Keep a trigger stop-list: alcohol, sleepless nights, endless scrolling — they hit the bar hardest.",
  "Before a tough call, take 5 deep breaths — a cheap way not to burn energy on stress.",
  "Prep clothes and breakfast the night before: fewer micro-decisions in the morning, more for what matters.",
  "Don't confuse fatigue and boredom. A boring but easy task may still be fine on normal energy.",
  "Agree on a no-news quiet day — your brain stops burning resources on anxiety.",
  "When recycle is on, use the day to recover: sleep, a walk, light work.",
  "💊 losses are irreversible until a new day — don't tap the button on autopilot, only on purpose.",
  "Try to end the day at 40%+ energy: easier to get up and not start the week in the red.",
  "Write down one win per day — a small motivation boost without extra system points.",
  "If the week is “red” on losses, drop one project instead of adding a new quest.",
  "Energy is a weekly resource. Budget it: essentials first, wants second.",
];

export function pickEnergyRecommendation(): string {
  const index = Math.floor(Math.random() * ENERGY_RECOMMENDATIONS.length);
  return ENERGY_RECOMMENDATIONS[index] ?? ENERGY_RECOMMENDATIONS[0];
}
