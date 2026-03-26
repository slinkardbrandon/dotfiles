import { listThemes, setActiveTheme, getAvailableThemes } from "./src/theme";

const args = process.argv.slice(2);

if (args[0] === "--list-slugs") {
  const themes = await getAvailableThemes();
  for (const t of themes) console.log(t.slug);
  process.exit(0);
}

if (args.length === 0) {
  await listThemes();
} else {
  try {
    await setActiveTheme(args[0]);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
