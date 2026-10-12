"""Плагин «Картинки в чате»: манифест и то, на чём держится поведение. Стандартная библиотека, без хаба и сети.
Запуск: python3 -m unittest discover -s tests"""
import json
import os
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


class Source(unittest.TestCase):
    def test_rules_of_the_owner(self):
        # владелец 12.10: картинки агента — всегда в чате; большая или много — небольшие превью; клик — лайтбокс
        js = read("main.js")
        self.assertIn('".feed .thumbs img, .feed .attach-list img"', js)   # картинки сообщения и присланные файлы
        self.assertIn("BIG = { w: 1000, h: 750 }", js)
        self.assertIn("MANY = 3", js)
        self.assertIn("imgs.length < MANY && sizes.every((s) => s.w <= BIG.w && s.h <= BIG.h)", js)
        self.assertIn('"ci-full", small', js)
        self.assertIn('"ci-thumb", !small', js)
        self.assertNotIn("body.append", js)                  # лайтбокс — штатный хаба, свой не строим
        css = read("style.css")
        self.assertIn("height: 96px", css)                    # превью — небольшие
        self.assertIn("max-width: 100%", css)                 # как есть, но не шире ленты

    def test_motion(self):
        # владелец 12.10: «плавное открытие, ховеры и зум», «когда позумил — пусть включается pan»
        js, css = read("main.js"), read("style.css")
        self.assertIn('prefers-reduced-motion: reduce', js)    # без движения — только прозрачность
        self.assertIn('prefers-reduced-motion: reduce', css)
        self.assertIn('token("--ease-out"', js)                 # кривые — токены ядра
        self.assertIn("(hover: hover) and (pointer: fine)", css)   # движение ховера — только с мышью
        self.assertNotIn("transition: all", css)
        self.assertIn("setPointerCapture", js)                   # pan: зажал и тащишь
        self.assertIn("if (dragged)", js)                        # протащил — не клик (зум не сбрасывается)
        self.assertIn("display: grid !important", css)           # уход окна виден, хотя ядро уже поставило hidden

    @unittest.skipUnless(shutil.which("node"), "нужен node")
    def test_script_parses(self):
        r = subprocess.run(["node", "--check", os.path.join(ROOT, "main.js")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)


if __name__ == "__main__":
    unittest.main()
