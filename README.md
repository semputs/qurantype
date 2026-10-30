# QuranType

Type the meaning of the Quran, one ayah at a time. The Arabic (Uthmani script) sits above, the chosen translation sits below in faint ink and darkens as you type it, and the recitation starts as soon as you begin each ayah.

It's meant to be calm rather than a game: no timers or scores, mistakes just turn the letter soft red and wait, and your place is saved so you can type a few ayat a day and finish a khatam over time.

## What it does

- **Pick a translation** on first visit: Bahasa Melayu (Abdullah Muhammad Basmeih), English (Saheeh International) or Bahasa Indonesia. Change it any time in settings.
- **Forgiving typing.** Capital letters and accents don't matter, punctuation fills in by itself and footnote numbers are removed. Words in brackets, like Saheeh International's "[all] praise", are typed too, or can be skipped in settings.
- **Enter or Space to continue.** When an ayah is fully typed its number fills with gold and a ↵ key sits beside a softly blinking space bar at the end; Enter, Space or a tap carries on. Turn on auto-continue in settings to skip this.
- **Finished ayat** glide down below the one you're typing, newest first, reflowing into the smaller list layout as they move. The list clears when a new surah starts.
- **Surah score page.** Finishing a surah shows its words, words per minute, accuracy and typing time.
- **Typing time.** A quiet clock in the header counts time spent typing, pausing after 5 seconds without a keystroke. Tap it for "My progress": total time, ayat typed, surahs finished and time per surah, so you can see how long the whole Quran took.
- **Illuminated frame** around the ayah being typed and the surah score page: a patterned gold band with a lobed window, corner rosettes and leaf finials, drawn to fit any ayah length. Pick another in settings: Tulip border, Pearl arch, Jewel bloom, Jewel octagon, or no frame.
- **Follows your typing.** On long ayat the page scrolls to keep the line you are typing in view, and each new ayah opens scrolled back to its top (or on to the caret, when the Arabic is very long).
- **Autotype (debug).** Open the site with `?debug` and a button on the left edge types by itself at 200 words per minute, continuing through ayat and surahs, for testing.
- **Calm to type in.** Letters ink in softly, a gold caret glides along under the next letter, and the header and footer fade away while you type (move the mouse to bring them back). The surah name and its "Ayah X of Y" bar stay at the top while you type..
- **Recitation** plays when you start typing an ayah (can be turned off), with the play button, or with Tab, which replays the current ayah from the start. Default reciter is Mishary Rashid Alafasy; others are in settings.
- **Resume anywhere.** Your exact position, even mid-ayah, is saved in the browser. No account needed.
- **Continue on another device.** In settings, "Get a sync code" gives three words like "keen red island". Enter them (or open the copied link) on another device and both stay in sync: position, typed ayat, typing time and settings. When both devices changed, the most recent change wins.
- **Surah index** behind the surah name at the top: every surah with how many ayat you've typed, ticks for finished ones, and "Continue my khatam" to jump to the next untyped ayah. You can open any surah; the khatam only counts ayat you have actually typed.
- **Progress** bar for the current surah, with ayat left, juz and the share of the Quran typed.
- **Pentadbir** at `/pentadbir`: a password-protected stats page for the site owner. Visitors per day (new and returning), how many typed, ayat, words and typing time, surahs finished and khatams, average speed and accuracy, translation and reciter choices, device, browser language, referring sites, most typed surahs and sync codes. Only daily totals are saved: no cookies on visitors and no IP addresses; a visitor is told apart within one day by a salted hash whose salt stays in memory and changes at midnight KL time. Do Not Track, Global Privacy Control and `?debug` turn counting off.
- Light and dark themes (follows your device by default), works on phones.

## Running it

It's a static site with no build step. Serve the folder with any web server:

```sh
npm start        # site and sync server on http://localhost:8787
npm run static   # site only, on http://localhost:8000 (sync codes won't work)
```

Opening `index.html` straight from disk won't work because browsers block ES modules on `file://`.

### Deploying

The site itself is static: serve the folder as it is. Sync codes also need the small server in `server/sync.js` (Node 20+, no dependencies) running on the same domain under `/api/`:

- Run it as a service: `deploy/qurantype-sync.service` (systemd). It listens on `127.0.0.1:8787` and keeps one JSON file per code in `DATA_DIR`. Back up that folder to keep people's progress.
- Proxy `/api/` to it from the web server: `deploy/nginx-sync.conf` (nginx, with the Caddy line too).
- The same server keeps the `/pentadbir` stats in `DATA_DIR/stats` (one JSON file of totals per day, KL time) and reads the page's password from `PENTADBIR_PASSWORD_FILE` (plain text, first line). Changing the password signs everyone out.
- Unknown codes and new codes are rate-limited per address (30 and 20 an hour), so codes can't be guessed by trying many.

## Tests

```sh
npm test
```

Runs the sync server tests and the typing rules in `js/typing.js` (what you have to type, what fills in, what counts as a match) with Node's built-in test runner. Node 20 or newer.

## Layout

- `index.html`: the page and its dialogs
- `og.jpg`: the 1200×630 link preview image
- `css/style.css`: all styling, with colour tokens for light and dark
- `js/app.js`: page behaviour (loading ayat, typing, audio, saving, settings)
- `js/typing.js`: pure typing rules, no DOM
- `js/api.js`: Al Quran Cloud client, translation and reciter lists
- `js/sync.js`, `js/words.js`: sync codes in the browser, and the words they're made of
- `server/sync.js`: the sync server
- `server/stats.js`, `js/stats.js`: anonymous visitor stats, server and browser side
- `pentadbir/`: the stats page
- `deploy/`: service and web server config for the sync server

## Credits and licence of the content

Quran text, translations and recitation audio come from [Al Quran Cloud](https://alquran.cloud) (free, no API key). The Arabic text is from [Tanzil](https://tanzil.net) and the per-ayah audio from [EveryAyah](https://everyayah.com). These are free to use with credit for **non-commercial** purposes, so the site should stay free with no ads or paid features, and keep the credits line in the footer.
