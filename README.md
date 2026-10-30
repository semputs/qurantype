# QuranType

Type the meaning of the Quran, one ayah at a time. The Arabic (Uthmani script) sits above, the chosen translation sits below in faint ink and darkens as you type it, and the recitation starts as soon as you begin each ayah.

It's meant to be calm rather than a game: no timers or scores, mistakes just turn the letter soft red and wait, and your place is saved so you can type a few ayat a day and finish a khatam over time.

## What it does

- **Pick a translation** on first visit: Bahasa Melayu (Abdullah Muhammad Basmeih), English (Saheeh International) or Bahasa Indonesia. Change it any time in settings.
- **Forgiving typing.** Capital letters and accents don't matter, punctuation fills in by itself and footnote numbers are removed. Words in brackets, like Saheeh International's "[all] praise", are typed too, or can be skipped in settings.
- **Enter or Space to continue.** When an ayah is fully typed its number fills with gold and a small ↵ key appears at the end; Enter, Space or a tap carries on. Turn on auto-continue in settings to skip this.
- **Finished ayat** glide down below the one you're typing, newest first, before the next ayah appears. The list clears when a new surah starts.
- **Surah score page.** Finishing a surah shows its words, words per minute, accuracy and typing time.
- **Typing time.** A quiet clock in the header counts time spent typing, pausing after 5 seconds without a keystroke. Tap it for "My progress": total time, ayat typed, surahs finished and time per surah, so you can see how long the whole Quran took.
- **Calm to type in.** Letters ink in softly, a gold caret glides along under the next letter, and the header and footer fade away while you type (move the mouse to bring them back).
- **Recitation** plays when you start typing an ayah (can be turned off), or with the play button. Default reciter is Mishary Rashid Alafasy; others are in settings.
- **Resume anywhere.** Your exact position, even mid-ayah, is saved in the browser. No account needed.
- **Surah index** behind the surah name at the top: every surah with how many ayat you've typed, ticks for finished ones, and "Continue my khatam" to jump to the next untyped ayah. You can open any surah; the khatam only counts ayat you have actually typed.
- **Progress** bar for the current surah, with ayat left, juz and the share of the Quran typed.
- Light and dark themes (follows your device by default), works on phones.

## Running it

It's a static site with no build step. Serve the folder with any web server:

```sh
npm start        # same as: python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` straight from disk won't work because browsers block ES modules on `file://`.

To deploy, upload the files as they are to any static host (a subdomain on semput.com, GitHub Pages, Netlify, etc.).

## Tests

```sh
npm test
```

Runs the typing rules in `js/typing.js` (what you have to type, what fills in, what counts as a match) with Node's built-in test runner. Node 20 or newer.

## Layout

- `index.html`: the page and its dialogs
- `css/style.css`: all styling, with colour tokens for light and dark
- `js/app.js`: page behaviour (loading ayat, typing, audio, saving, settings)
- `js/typing.js`: pure typing rules, no DOM
- `js/api.js`: Al Quran Cloud client, translation and reciter lists

## Credits and licence of the content

Quran text, translations and recitation audio come from [Al Quran Cloud](https://alquran.cloud) (free, no API key). The Arabic text is from [Tanzil](https://tanzil.net) and the per-ayah audio from [EveryAyah](https://everyayah.com). These are free to use with credit for **non-commercial** purposes, so the site should stay free with no ads or paid features, and keep the credits line in the footer.
