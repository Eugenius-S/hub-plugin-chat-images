"""The "Chat images" plugin: the manifest and what the behaviour rests on. Standard library, no hub and no network.
Run: python3 -m unittest discover -s tests"""
import json
import os
import re
import shutil
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return f.read()


class Manifest(unittest.TestCase):
    def test_manifest_is_complete(self):
        man = json.loads(read("hub-plugin.json"))
        self.assertEqual((man["name"], man["web"], man["hub"]), ("chat-images", "main.js", "^1.10"))
        for key in ("icon", "description", "why", "version"):
            self.assertTrue(str(man.get(key) or "").strip(), key)
        for key in ("icon", "web"):
            self.assertTrue(os.path.isfile(os.path.join(ROOT, man[key])), man[key])

    def test_manifest_is_english_with_russian_translation(self):
        man = json.loads(read("hub-plugin.json"))
        for key in ("description", "why"):
            self.assertIsNone(re.search("[\u0400-\u04ff]", man[key]), key)       # the base text is English
            self.assertTrue(man["i18n"]["ru"][key].strip(), key)                  # Russian is in i18n.ru
            self.assertIsNotNone(re.search("[\u0400-\u04ff]", man["i18n"]["ru"][key]), key)


class Source(unittest.TestCase):
    def test_rules_of_the_owner(self):
        # agent images always show in the chat; a big one or many are small previews; a click opens the lightbox
        js = read("main.js")
        self.assertIn('".feed .thumbs img, .feed .attach-list img"', js)   # the message's images and sent files
        self.assertIn("BIG = { w: 1000, h: 750 }", js)
        self.assertIn("MANY = 3", js)
        self.assertIn("imgs.length < MANY && sizes.every((s) => s.w <= BIG.w && s.h <= BIG.h)", js)
        self.assertIn('"ci-full", small', js)
        self.assertIn('"ci-thumb", !small', js)
        self.assertNotIn("body.append", js)                  # the lightbox is the hub's own, we do not build one
        css = read("style.css")
        self.assertIn("height: 96px", css)                    # previews are small
        self.assertIn("max-width: 100%", css)                 # as is, but not wider than the feed

    def test_motion(self):
        # "smooth opening, hovers and zoom", "once zoomed, pan should work"
        js, css = read("main.js"), read("style.css")
        self.assertIn('prefers-reduced-motion: reduce', js)    # no motion: opacity only
        self.assertIn('prefers-reduced-motion: reduce', css)
        self.assertIn('token("--ease-out"', js)                 # curves are core tokens
        self.assertIn("(hover: hover) and (pointer: fine)", css)   # hover motion only with a mouse
        self.assertNotIn("transition: all", css)
        self.assertIn("setPointerCapture", js)                   # pan: press and drag
        self.assertIn("if (dragged)", js)                        # a drag is not a click (zoom is not reset)
        self.assertIn("display: grid !important", css)           # the window's exit is visible although the core set hidden

    @unittest.skipUnless(shutil.which("node"), "node is required")
    def test_script_parses(self):
        r = subprocess.run(["node", "--check", os.path.join(ROOT, "main.js")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)


class Strings(unittest.TestCase):
    """The interface strings are looked up at the moment of use by hub.lang: English by default, Russian for ru."""

    @staticmethod
    def title(lang):
        script = (
            "import fs from 'node:fs';\n"
            "const src = fs.readFileSync(process.argv[1], 'utf8');\n"
            "const body = src.slice(src.indexOf('const STR'), src.indexOf('const PICK'));\n"
            "const make = new Function(body + '\\nreturn { t, STR, setHub: (h) => { hub = h; } };');\n"
            "const m = make(null);\n"
            "m.setHub(process.argv[2] === 'none' ? {} : { lang: process.argv[2] });\n"
            "console.log(m.t('open'));\n"
        )
        out = subprocess.run(["node", "--input-type=module", "-e", script, os.path.join(ROOT, "main.js"), lang],
                             capture_output=True, text=True, encoding="utf-8")
        assert out.returncode == 0, out.stderr
        return out.stdout.strip()

    @unittest.skipUnless(shutil.which("node"), "node is required")
    def test_english_is_the_default_and_russian_works(self):
        self.assertEqual(self.title("en"), "Open full size")
        self.assertEqual(self.title("none"), "Open full size")      # no language: English
        self.assertEqual(self.title("de"), "Open full size")        # unknown language: English
        self.assertEqual(self.title("ru"), "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043a\u0440\u0443\u043f\u043d\u043e")   # the original Russian text

    def test_language_is_read_at_use_time(self):
        js = read("main.js")
        self.assertIn("hub?.lang", js)                               # looked up in t(), not at module load
        self.assertIn('t("open")', js)
        self.assertEqual(set(re.findall(r"^  (en|ru):", js, re.M)), {"en", "ru"})


if __name__ == "__main__":
    unittest.main()


class BrokenPictures(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "node is required")
    def test_each_picture_is_awaited_once(self):
        # broken pictures (deleted MJ grids): subscribing again on every error doubled the handlers,
        # 8 broken ones in a message meant a million subscriptions, and the chat hung the page
        out = subprocess.run(["node", os.path.join(ROOT, "tests", "lay.mjs")], capture_output=True, text=True, check=True)
        self.assertLessEqual(int(out.stdout.strip()), 8 * 4)
