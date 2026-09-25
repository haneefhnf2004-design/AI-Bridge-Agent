"""Intelligent mock brain — port of bridgeProxy.js mockCompletion.

Language detection: Tamil (script + roman), Hindi (script + roman), else English.
Intent order mirrors Node: calculator, translation, purpose, code,
tamil-help-exact, greeting, ideas, math (ast-safe), email, essay, story,
joke, image SVG, meaning, howto, general.
"""
from __future__ import annotations

import ast
import operator as _op
import re

E = "\U0001f60a"

LANGS = {
    "tamil": {"label": "Tamil", "flag": "\U0001f1ee\U0001f1f3",
              "hello": "Vanakkam (\u0bb5\u0ba3\u0b95\u0bcd\u0b95\u0bae\u0bcd)",
              "how": "Neenga eppadi irukkeenga? (\u0ba8\u0bc0\u0b99\u0bcd\u0b95\u0bb3\u0bcd \u0b8e\u0baa\u0bcd\u0baa\u0b9f\u0bbf \u0b87\u0bb0\u0bc1\u0b95\u0bcd\u0b95\u0bbf\u0bb1\u0bc0\u0bb0\u0bcd\u0b95\u0bb3\u0bcd?)",
              "thanks": "Nandri (\u0ba8\u0ba9\u0bcd\u0bb1\u0bbf)",
              "morning": "Kaalai Vanakkam (\u0b95\u0bbe\u0bb2\u0bc8 \u0bb5\u0ba3\u0b95\u0bcd\u0b95\u0bae\u0bcd)"},
    "hindi": {"label": "Hindi", "flag": "\U0001f1ee\U0001f1f3",
              "hello": "Namaste (\u0928\u092e\u0938\u094d\u0924\u0947)",
              "how": "Aap kaise hain? (\u0906\u092a \u0915\u0948\u0938\u0947 \u0939\u0948\u0902?)",
              "thanks": "Dhanyavaad (\u0927\u0928\u094d\u092f\u0935\u093e\u0926)",
              "morning": "Suprabhat (\u0938\u0941\u092a\u094d\u0930\u092d\u093e\u0924)"},
    "english": {"label": "English", "flag": "\U0001f1ec\U0001f1e7",
                "hello": "Hello", "how": "How are you?",
                "thanks": "Thank you", "morning": "Good morning"},
    "malayalam": {"label": "Malayalam", "flag": "\U0001f1ee\U0001f1f3",
                  "hello": "Namaskaram (\u0d28\u0d2e\u0d38\u0d4d\u0d15\u0d3e\u0d30\u0d02)",
                  "how": "Sukhamano? (\u0d38\u0d41\u0d16\u0d2e\u0d3e\u0d23\u0bcb?)",
                  "thanks": "Nanni (\u0d28\u0d28\u0d4d\u0d26\u0bbf)",
                  "morning": "Suprabhatham (\u0d38\u0d41\u0d2a\u0d4d\u0d30\u0d2d\u0d3e\u0d24\u0d02)"},
    "telugu": {"label": "Telugu", "flag": "\U0001f1ee\U0001f1f3",
               "hello": "Namaskaram (\u0c28\u0cae\u0cb8\u0ccd\u0c15\u0c3e\u0cb0\u0c02)",
               "how": "Ela unnaru? (\u0c0e\u0cb2\u0c3e \u0c09\u0ca8\u0ccd\u0ca8\u0c3e\u0cb0\u0c41?)",
               "thanks": "Dhanyavadalu (\u0c27\u0ca8\u0ccd\u0caf\u0cb5\u0c3e\u0ca6\u0c3e\u0cb2\u0cc1)",
               "morning": "Shubhodayam (\u0c36\u0cc1\u0cad\u0bcb\u0ca6\u0caf\u0c02)"},
    "kannada": {"label": "Kannada", "flag": "\U0001f1ee\U0001f1f3",
                "hello": "Namaskara (\u0ca8\u0cae\u0cb8\u0ccd\u0c95\u0c3e\u0cb0)",
                "how": "Hegiddira? (ಹೇಗಿದ್ದೀರಾ?))",
                "thanks": "Dhanyavada (\u0c27\u0ca8\u0ccd\u0caf\u0cb5\u0c3e\u0ca6)",
                "morning": "Shubhodaya (\u0cb6\u0cc1\u0cad\u0ccb\u0cc6\u0ca6\u0caf)"},
    "sinhala": {"label": "Sinhala", "flag": "\U0001f1f1\U0001f1f0",
                "hello": "Ayubowan (\u0d86\u0dba\u0dd4\u0db6\u0ddd\u0dc0\u0db1\u0dca)",
                "how": "Oya kohomada? (\u0d94\u0dc0\u0dcf \u0d9a\u0dd2\u0dc4\u0dc4\u0db8\u0daf?)",
                "thanks": "Bohoma sthuthi (\u0db6\u0dd2\u0dc4\u0dc4\u0db8 \u0dc3\u0dca\u0dad\u0dd6\u0dad\u0dd2\u0dba\u0dd2)",
                "morning": "Suba udasanak (\u0dc3\u0dd4\u0db6 \u0d8b\u0daf\u0dd0\u0dc3\u0db1\u0d9a\u0dca)"},
    "bengali": {"label": "Bengali", "flag": "\U0001f1e7\U0001f1e9",
                "hello": "Nomoshkar (\u09a8\u09ae\u09b8\u09cd\u0995\u09be\u09b0)",
                "how": "Apni kemon achen? (\u0986\u09aa\u09a8\u09bf \u0995\u09c7\u09ae\u09a8 \u0986\u099b\u09c7\u09a8?)",
                "thanks": "Dhonnobad (\u09a7\u09a8\u09cd\u09af\u09ac\u09be\u09a6)",
                "morning": "Shuprobhat (\u09b8\u09c1\u09aa\u09cd\u09b0\u09ad\u09be\u09a4)"},
    "urdu": {"label": "Urdu", "flag": "\U0001f1f5\U0001f1f0",
             "hello": "Assalam-o-Alaikum (\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u06cc\u06a9\u0645)",
             "how": "Aap kaise hain? (\u0622\u067e \u06a9\u06cc\u0633\u06d2 \u06c1\u06cc\u06ba\u061f)",
             "thanks": "Shukriya (\u0634\u06a9\u0631\u06cc\u06c1)",
             "morning": "Subah bakhair (\u0635\u0628\u062d \u0628\u062e\u06cc\u0631)"},
    "arabic": {"label": "Arabic", "flag": "\U0001f1f8\U0001f1e6",
               "hello": "Marhaba (\u0645\u0631\u062d\u0628\u0627)",
               "how": "Kaifa haluk? (\u0643\u064a\u0641 \u062d\u0627\u0644\u0643\u061f)",
               "thanks": "Shukran (\u0634\u0643\u0631\u0627\u064b)",
               "morning": "Sabah al-khair (\u0635\u0628\u0627\u062d \u0627\u0644\u062e\u064a\u0631)"},
    "spanish": {"label": "Spanish", "flag": "\U0001f1ea\U0001f1f8",
                "hello": "Hola", "how": "\u00bfC\u00f3mo est\u00e1s?",
                "thanks": "Gracias", "morning": "Buenos d\u00edas"},
    "french": {"label": "French", "flag": "\U0001f1eb\U0001f1f7",
               "hello": "Bonjour", "how": "Comment \u00e7a va ?",
               "thanks": "Merci", "morning": "Bonjour"},
    "german": {"label": "German", "flag": "\U0001f1e9\U0001f1ea",
               "hello": "Hallo", "how": "Wie geht es dir?",
               "thanks": "Danke", "morning": "Guten Morgen"},
    "portuguese": {"label": "Portuguese", "flag": "\U0001f1f5\U0001f1f9",
                   "hello": "Ol\u00e1", "how": "Como vai voc\u00ea?",
                   "thanks": "Obrigado", "morning": "Bom dia"},
    "russian": {"label": "Russian", "flag": "\U0001f1f7\U0001f1fa",
                "hello": "Privet (\u041f\u0440\u0438\u0432\u0435\u0442)",
                "how": "Kak dela? (\u041a\u0430\u043a \u0434\u0435\u043b\u0430?)",
                "thanks": "Spasibo (\u0421\u043f\u0430\u0441\u0438\u0431\u043e)",
                "morning": "Dobroye utro (\u0414\u043e\u0431\u0440\u043e\u0435 \u0443\u0442\u0440\u043e)"},
    "chinese": {"label": "Chinese", "flag": "\U0001f1e8\U0001f1f3",
                "hello": "N\u01d0 h\u01ceo (\u4f60\u597d)",
                "how": "N\u01d0 h\u01ceo ma? (\u4f60\u597d\u5417\uff1f)",
                "thanks": "Xi\u00e8xie (\u8c22\u8c22)", "morning": "Z\u01ceo \u0101n (\u65e9\u5b89)"},
    "japanese": {"label": "Japanese", "flag": "\U0001f1ef\U0001f1f5",
                 "hello": "Konnichiwa (\u3053\u3093\u306b\u3061\u306f)",
                 "how": "Ogenki desu ka? (\u304a\u5143\u6c17\u3067\u3059\u304b\uff1f)",
                 "thanks": "Arigatou (\u3042\u308a\u304c\u3068\u3046)",
                 "morning": "Ohayou (\u304a\u306f\u3088\u3046)"},
    "korean": {"label": "Korean", "flag": "\U0001f1f0\U0001f1f7",
               "hello": "Annyeonghaseyo (\uc548\ub155\ud558\uc138\uc694)",
               "how": "Jal jinaeseyo? (\uc798 \uc9c0\ub0b4\uc138\uc694?)",
               "thanks": "Gamsahamnida (\uac10\uc0ac\ud569\ub2c8\ub2e4)",
               "morning": "Joeun achim (\uc88b\uc740 \uc544\uce68)"},
    "marathi": {"label": "Marathi", "flag": "\U0001f1ee\U0001f1f3",
                "hello": "Namaskar (\u0928\u092e\u0938\u094d\u0915\u093e\u0930)",
                "how": "Tumhi kase aahat? (\u0924\u0941\u092e\u094d\u0939\u0940 \u0915\u0938\u0947 \u0906\u0939\u093e\u0924?)",
                "thanks": "Dhanyavad (\u0927\u0928\u094d\u092f\u0935\u093e\u0926)",
                "morning": "Shubh sakal (\u0936\u0941\u092d \u0938\u0915\u093e\u0933)"},
    "italian": {"label": "Italian", "flag": "\U0001f1ee\U0001f1f9",
                "hello": "Ciao", "how": "Come stai?",
                "thanks": "Grazie", "morning": "Buongiorno"},
}

TA_DICT = {
    "ai": "\u0b8f\u0b90", "agent": "\u0b8f\u0b9c\u0bc6\u0ba3\u0bcd\u0b9f\u0bcd",
    "bridge": "\u0baa\u0bbf\u0bb0\u0bbf\u0b9f\u0bcd\u0b9c\u0bcd", "purpose": "\u0ba8\u0bcb\u0b95\u0bcd\u0b95\u0bae\u0bcd",
    "three": "\u0bae\u0bc2\u0ba9\u0bcd\u0bb1\u0bc1", "main": "\u0bae\u0bc1\u0b95\u0bcd\u0b95\u0bbf\u0baf",
    "all": "\u0b8e\u0bb2\u0bcd\u0bb2\u0bbe", "no": "\u0b87\u0bb2\u0bcd\u0bb2\u0bc8",
    "need": "\u0ba4\u0bc7\u0bb5\u0bc8", "between": "\u0b87\u0b9f\u0bc8\u0baf\u0bc7",
    "app": "\u0b86\u0baa\u0bcd", "apps": "\u0b86\u0baa\u0bcd\u0b95\u0bb3\u0bcd",
    "ask": "\u0b95\u0bc7\u0bb3\u0bc1\u0b99\u0bcd\u0b95\u0bb3\u0bcd", "best": "\u0b9a\u0bbf\u0bb1\u0ba8\u0bcd\u0ba4",
    "answer": "\u0baa\u0ba4\u0bbf\u0bb2\u0bcd", "copy": "\u0b95\u0bbe\u0baa\u0bcd\u0baa\u0bbf \u0b9a\u0bc6\u0baf\u0bcd\u0ba4\u0bc1",
    "here": "\u0b87\u0b99\u0bcd\u0b95\u0bc7", "languages": "\u0bae\u0bca\u0bb4\u0bbf\u0b95\u0bb3\u0bcd",
    "language": "\u0bae\u0bca\u0bb4\u0bbf", "translation": "\u0bae\u0bca\u0bb4\u0bbf\u0baa\u0bc6\u0baf\u0bb0\u0bcd\u0baa\u0bcd\u0baa\u0bc1",
    "code": "\u0b95\u0bcb\u0b9f\u0bcd", "ideas": "\u0b90\u0b9f\u0bbf\u0baf\u0bbe\u0b95\u0bcd\u0b95\u0bb3\u0bcd",
    "idea": "\u0b90\u0b9f\u0bbf\u0baf\u0bbe", "hindi": "\u0bb9\u0bbf\u0ba8\u0bcd\u0ba4\u0bbf",
    "calculator": "\u0b95\u0bbe\u0bb2\u0bcd\u0b95\u0bc1\u0bb2\u0bc7\u0b9f\u0bcd\u0b9f\u0bb0\u0bcd",
    "question": "\u0b95\u0bc7\u0bb3\u0bcd\u0bb5\u0bbf", "great": "\u0b85\u0bb0\u0bc1\u0bae\u0bc8",
    "with": "\u0b89\u0b9f\u0ba9\u0bcd", "your": "\u0b89\u0b99\u0bcd\u0b95\u0bb3\u0bcd",
    "you": "\u0ba8\u0bc0\u0b99\u0bcd\u0b95\u0bb3\u0bcd", "and": "\u0bae\u0bb1\u0bcd\u0bb1\u0bc1\u0bae\u0bcd",
    "or": "\u0b85\u0bb2\u0bcd\u0bb2\u0ba4\u0bc1", "for": "\u0b95\u0bcd\u0b95\u0bbe\u0b95",
    "more": "\u0bae\u0bc7\u0bb2\u0bc1\u0bae\u0bcd", "get": "\u0baa\u0bc6\u0bb1\u0bc1\u0b99\u0bcd\u0b95\u0bb3\u0bcd",
    "me": "\u0b8e\u0ba9\u0b95\u0bcd\u0b95\u0bc1", "hello": "\u0bb5\u0ba3\u0b95\u0bcd\u0b95\u0bae\u0bcd",
    "how": "\u0b8e\u0baa\u0bcd\u0baa\u0b9f\u0bbf", "good": "\u0ba8\u0bb2\u0bcd\u0bb2",
    "morning": "\u0b95\u0bbe\u0bb2\u0bc8", "this": "\u0b87\u0ba4\u0bc1", "that": "\u0b85\u0ba4\u0bc1",
    "is": "", "are": "", "was": "", "a": "", "an": "", "the": "", "to": "",
    "what": "\u0b8e\u0ba9\u0bcd\u0ba9", "why": "\u0b8f\u0ba9\u0bcd", "when": "\u0b8e\u0baa\u0bcd\u0baa\u0bcb\u0ba4\u0bc1",
    "where": "\u0b8e\u0b99\u0bcd\u0b95\u0bc7", "who": "\u0baf\u0bbe\u0bb0\u0bcd",
    "not": "\u0b87\u0bb2\u0bcd\u0bb2\u0bc8", "very": "\u0bae\u0bbf\u0b95\u0bb5\u0bc1\u0bae\u0bcd",
    "have": "\u0b89\u0bb3\u0bcd\u0bb3\u0ba4\u0bc1", "use": "\u0baa\u0baf\u0ba9\u0bcd\u0baa\u0b9f\u0bc1\u0ba4\u0bcd\u0ba4\u0bc1\u0b99\u0bcd\u0b95\u0bb3\u0bcd",
    "new": "\u0baa\u0bc1\u0ba4\u0bbf\u0baf", "now": "\u0b87\u0baa\u0bcd\u0baa\u0bcb\u0ba4\u0bc1",
    "today": "\u0b87\u0ba9\u0bcd\u0bb1\u0bc1", "help": "\u0b89\u0ba4\u0bb5\u0bbf",
    "want": "\u0bb5\u0bc7\u0ba3\u0bcd\u0b9f\u0bc1\u0bae\u0bcd", "make": "\u0b9a\u0bc6\u0baf\u0bcd\u0baf\u0bc1\u0b99\u0bcd\u0b95\u0bb3\u0bcd",
    "give": "\u0b95\u0bca\u0b9f\u0bc1\u0b99\u0bcd\u0b95\u0bb3\u0bcd", "time": "\u0ba8\u0bc7\u0bb0\u0bae\u0bcd",
    "day": "\u0ba8\u0bbe\u0bb3\u0bcd", "work": "\u0bb5\u0bc7\u0bb2\u0bc8",
}

HI_DICT = {
    "ai": "\u090f\u0906\u0908", "agent": "\u090f\u091c\u0947\u0902\u091f",
    "bridge": "\u092c\u094d\u0930\u093f\u091c", "purpose": "\u0909\u0926\u094d\u0926\u0947\u0936\u094d\u092f",
    "three": "\u0924\u0940\u0928", "main": "\u092e\u0941\u0916\u094d\u092f", "all": "\u0938\u092d\u0940",
    "no": "\u0928\u0939\u0940\u0902", "need": "\u091a\u093e\u0939\u093f\u090f",
    "between": "\u092c\u0940\u091a", "app": "\u0910\u092a", "apps": "\u0910\u092a\u094d\u0938",
    "ask": "\u092a\u0942\u091b\u094b", "best": "\u0938\u092c\u0938\u0947 \u0905\u091a\u094d\u091b\u093e",
    "answer": "\u091c\u0935\u093e\u092c", "here": "\u092f\u0939\u093e\u0901",
    "languages": "\u092d\u093e\u0937\u093e\u0913\u0902 \u092e\u0947\u0902",
    "language": "\u092d\u093e\u0937\u093e \u092e\u0947\u0902",
    "translation": "\u0905\u0928\u0941\u0935\u093e\u0926", "code": "\u0915\u094b\u0921",
    "ideas": "\u0906\u0907\u0921\u093f\u092f\u093e", "hindi": "\u0939\u093f\u0902\u0926\u0940",
    "calculator": "\u0915\u0948\u0932\u0915\u0941\u0932\u0947\u091f\u0930",
    "question": "\u0938\u0935\u093e\u0932", "great": "\u092c\u0939\u0941\u0924 \u092c\u0922\u093c\u093f\u092f\u093e",
    "with": "\u0915\u0947 \u0938\u093e\u0925", "your": "\u0924\u0941\u092e\u094d\u0939\u093e\u0930\u093e",
    "you": "\u0924\u0941\u092e", "and": "\u0914\u0930", "or": "\u092f\u093e",
    "for": "\u0915\u0947 \u0932\u093f\u090f", "from": "\u0938\u0947",
    "more": "\u0914\u0930", "get": "\u092a\u093e\u0913", "me": "\u092e\u0941\u091d\u0947",
    "this": "\u092f\u0939", "that": "\u0935\u0939", "is": "", "are": "",
    "a": "", "an": "", "the": "", "to": "", "what": "\u0915\u094d\u092f\u093e",
    "not": "\u0928\u0939\u0940\u0902", "use": "\u0907\u0938\u094d\u0924\u0947\u092e\u093e\u0932 \u0915\u0930\u094b",
    "new": "\u0928\u092f\u093e", "now": "\u0905\u092c", "help": "\u092e\u0926\u0926",
    "make": "\u092c\u0928\u093e\u0913", "give": "\u0926\u094b",
    "time": "\u0938\u092e\u092f", "work": "\u0915\u093e\u092e",
    "my": "\u092e\u0947\u0930\u093e", "name": "\u0928\u093e\u092e",
}

SI_DICT = {
    "ai": "\u0d92\u0d86\u0d92\u0dba", "agent": "\u0d92\u0da2\u0db1\u0dca\u0dad\u0dba\u0dcf",
    "bridge": "\u0db6\u0dca\u200d\u0dbb\u0dd2\u0da2\u0dca", "purpose": "\u0d85\u0dbb\u0db8\u0dd4\u0dab",
    "three": "\u0dad\u0dd4\u0db1", "main": "\u0db4\u0dca\u200d\u0dbb\u0dc4\u0dcf\u0db1",
    "all": "\u0dc3\u0dd2\u0dba\u0dbd\u0dca\u0dbd", "no": "\u0db1\u0dd0\u0dc4\u0dad\u0dd0",
    "need": "\u0d94\u0db1", "between": "\u0d85\u0dad\u0dbb",
    "ask": "\u0d85\u0dc4\u0db1\u0dca\u0db1", "best": "\u0dc4\u0dd2\u0d82\u0daf\u0db8",
    "answer": "\u0d8b\u0dad\u0dca\u0dad\u0dbb\u0dba", "here": "\u0db8\u0dd9\u0dad\u0db1",
    "language": "\u0db7\u0dcf\u0dc2\u0dcf\u0dc0", "translation": "\u0db4\u0dbb\u0dd2\u0dc0\u0dbb\u0dca\u0dad\u0db1\u0dba",
    "code": "\u0d9a\u0ddd\u0da9\u0dca", "ideas": "\u0d85\u0daf\u0dc4\u0dc3\u0dca",
    "hindi": "\u0dc4\u0dd2\u0db1\u0dca\u0daf\u0dd2", "calculator": "\u0d9a\u0dd0\u0dbd\u0d9a\u0dd2\u0dba\u0dd4\u0dbd\u0dda\u0da7\u0dbb\u0dca",
    "great": "\u0db1\u0dd2\u0dba\u0db8\u0dba\u0dd2", "with": "\u0dc3\u0db8\u0d9c",
    "your": "\u0d94\u0dc0\u0dcf\u0d9c\u0dda", "you": "\u0d94\u0dc0\u0dcf",
    "and": "\u0dc3\u0dc4", "or": "\u0dc4\u0ddd", "for": "\u0dc3\u0db3\u0dc4\u0dcf",
    "more": "\u0dad\u0dc0\u0dad\u0dca", "get": "\u0d9c\u0db1\u0dca\u0db1",
    "me": "\u0db8\u0da7", "hello": "\u0d86\u0dba\u0dd4\u0db6\u0ddd\u0dc0\u0db1\u0dca",
    "how": "\u0d9a\u0dd2\u0dc4\u0dc4\u0db8\u0daf", "good": "\u0dc3\u0dd4\u0db6",
    "morning": "\u0d8b\u0daf\u0dd0\u0dc3\u0db1", "this": "\u0db8\u0dda",
    "that": "\u0d92", "is": "", "are": "", "a": "", "an": "", "the": "",
    "to": "", "what": "\u0db8\u0dd2\u0d9a\u0d9a\u0dca\u0daf", "not": "\u0db1\u0dd0\u0dc4\u0dad\u0dd0",
    "use": "\u0db7\u0dcf\u0dc0\u0dd2\u0dad\u0dcf \u0d9a\u0bb0\u0db1\u0dca\u0db1",
    "new": "\u0d85\u0dbd\u0dd4\u0dad\u0dca", "now": "\u0daf\u0dd0\u0db1\u0dca",
    "help": "\u0d8b\u0daf\u0dc0\u0dd4", "make": "\u0dc4\u0daf\u0db1\u0dca\u0db1",
    "give": "\u0daf\u0dd9\u0db1\u0dca\u0db1", "time": "\u0d9a\u0dcf\u0dbd\u0dba",
    "work": "\u0dc0\u0dd2\u0da9",
}


def _dict_for(lang):
    return {"tamil": TA_DICT, "hindi": HI_DICT, "sinhala": SI_DICT}.get(lang)


def detect_target_lang(text: str):
    t = text.lower()
    tail = t[-60:]
    m = re.search(r"(?:translate|translation|convert)\s*(?:to|into|in)?\s*([a-z]+)\s*[.?!]*$", tail) \
        or re.search(r"([a-z]+)\s+translation\s*[.?!]*$", tail)
    if m and m.group(1) in LANGS:
        return m.group(1)
    m = re.search(r"(?:translate|translation|convert)\s*(?:to|into|in)?\s*([a-z]+)", t) \
        or re.search(r"([a-z]+)\s+translation", t) \
        or re.search(r"(?:in|to)\s+([a-z]+)\s+please", t)
    if m and m.group(1) in LANGS:
        return m.group(1)
    for k in LANGS:
        if re.search(r"\b" + re.escape(k) + r"\b", t):
            return k
    return None


def strip_instruction(text: str) -> str:
    t = " " + text + " "
    t = re.sub(r"[\u201c\u201d\"]", " ", t)
    t = re.sub(r"^\s*(please\s+)?(translate|convert)\b[^.?!]{0,60}", " ", t, flags=re.I)
    t = re.sub(r"(translate|convert)\b[^.?!]{0,60}\s*[.?!]*$", " ", t, flags=re.I)
    t = re.sub(r"\b\w+\s+translation\s*[.?!]*$", " ", t, flags=re.I)
    t = re.sub(r"\b(this|that|the following|the below|the above|given text|my text)\b",
               " ", t, flags=re.I)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"^[.?!\s,;:]+", "", t)
    t = re.sub(r"[.?!]*(?:to\s+[a-z]+\s*)?[.?!\s]*$", "", t)
    return t.strip()


def dict_translate_sentence(sentence: str, d: dict) -> str:
    parts = re.split(r"(\s+)", sentence)
    out = []
    for tok in parts:
        m = re.match(r"^([A-Za-z']+)([.,!?;:\"“”)\]]*)$", tok)
        if not m:
            out.append(tok)
            continue
        rep = d.get(m.group(1).lower())
        if rep is None:
            out.append(tok)
        else:
            out.append((rep + (m.group(2) or "")).strip())
    return re.sub(r"[ \t]{2,}", " ", "".join(out)).strip()


def extract_quoted(text: str):
    m = re.search(r"[\"'\u201c\u201d]([^\"'\u201c\u201d]+)[\"'\u201c\u201d]", text)
    return m.group(1).strip().lower().rstrip("?!.,") if m else None


def lookup_phrase(sentence: str, lang: str):
    s = sentence.lower().rstrip("?!.,").strip()
    L = LANGS[lang]
    if re.match(r"^(hello|hi|hey|vanakkam|namaste)$", s):
        return L["hello"]
    if "how are you" in s:
        return L["how"]
    if "thank" in s:
        return L["thanks"]
    if "good morning" in s:
        return L["morning"]
    return None


CALC_HTML = """```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Calculator</title>
<style>
*{box-sizing:border-box;font-family:Inter,system-ui,sans-serif}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f172a;margin:0}
.calc{width:320px;background:#1e293b;border-radius:20px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.display{width:100%;height:64px;background:#0f172a;color:#fff;font-size:32px;text-align:right;padding:12px 16px;border-radius:12px;border:none;outline:none;margin-bottom:14px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
button{height:56px;border:none;border-radius:12px;font-size:20px;cursor:pointer}
.num{background:#334155;color:#fff}.op{background:#7c3aed;color:#fff}
.eq{background:#06b6d4;color:#fff;font-weight:700}.clear{background:#ef4444;color:#fff}
.zero{grid-column:span 2}
</style>
</head>
<body>
<div class="calc">
  <input id="display" class="display" readonly value="0" />
  <div class="grid">
    <button class="clear" onclick="clearAll()">C</button>
    <button class="op" onclick="append('%')">%</button>
    <button class="op" onclick="backspace()">&#9003;</button>
    <button class="op" onclick="append('/')">&divide;</button>
    <button class="num" onclick="append('7')">7</button>
    <button class="num" onclick="append('8')">8</button>
    <button class="num" onclick="append('9')">9</button>
    <button class="op" onclick="append('*')">&times;</button>
    <button class="num" onclick="append('4')">4</button>
    <button class="num" onclick="append('5')">5</button>
    <button class="num" onclick="append('6')">6</button>
    <button class="op" onclick="append('-')">&minus;</button>
    <button class="num" onclick="append('1')">1</button>
    <button class="num" onclick="append('2')">2</button>
    <button class="num" onclick="append('3')">3</button>
    <button class="op" onclick="append('+')">+</button>
    <button class="num zero" onclick="append('0')">0</button>
    <button class="num" onclick="append('.')">.</button>
    <button class="eq" onclick="calc()">=</button>
  </div>
</div>
<script>
let cur='0';
const d=()=>document.getElementById('display');
function append(c){cur=(cur==='0'&&c!=='.')?c:cur+c;d().value=cur;}
function clearAll(){cur='0';d().value=cur;}
function backspace(){cur=cur.length>1?cur.slice(0,-1):'0';d().value=cur;}
function calc(){try{const v=Function('"use strict";return('+cur+')')();cur=String(Number(v.toFixed(8)));}catch{cur='Error';}d().value=cur;}
</script>
</body>
</html>
```"""


def purpose_text(lang: str) -> str:
    if lang == "tamil":
        return (f"Nalla kelvi! {E} **AI Bridge Agent** oru **Universal AI Chat + Transfer Tool**"
                " -- ithoda purpose moonu mukkiyamana vishayam:\n\n"
                "**1. Ella AI-yum orae chat la** -- Vera vera AI kitta thaniya poga vendaam. "
                "Inga auto mode la ketta, best AI thana pick aagi pathil tharum.\n\n"
                "**2. Chat transfer (Bridge)** -- Vera AI la pesinatha inga copy panni continue pannalaam. "
                "Context miss aagaathu.\n\n"
                "**3. 100+ mozhi + code + ideas** -- Tamil, Hindi, Arabic, French... 100+ languages la "
                "translate, calculator maathiri full working code, ideas ellam kidaikkum.\n\n"
                "Suruvi sollana: **oru chat la ella AI-yoda power-um.** Ippo try pannunga -- "
                "Translate to Hindi illa calculator code kudu nu sollunga!")
    if lang == "hindi":
        return (f"Bahut badhiya sawal! {E} **AI Bridge Agent** ek **Universal AI chat + transfer tool** hai"
                " -- iske teen main purpose:\n\n"
                "**1. Sab AI ek hi chat me** -- Alag alag apps me jaane ki zaroorat nahi. "
                "Auto mode me poochho, best AI jawab dega.\n\n"
                "**2. Chat transfer (Bridge)** -- Kisi bhi AI ki baatcheet copy karke yahan continue karo. "
                "Context kabhi lose nahi hoga.\n\n"
                "**3. 100+ bhasha + code + ideas** -- 100+ languages me translate, full working code, "
                "ideas -- sab kuch.\n\n"
                "Ek line me: **ek chat me har AI ki power.** Try karo -- Translate to Hindi bolo ya "
                "calculator code mango!")
    return (f"Great question! {E} **AI Bridge Agent** is a **Universal AI chat + transfer tool** "
            "with three main purposes:\n\n"
            "**1. All AIs in one chat** -- No need to jump between apps. Ask in auto mode and the best AI answers.\n\n"
            "**2. Chat transfer (Bridge)** -- Copy a conversation from any other AI and continue it here. "
            "No context lost.\n\n"
            "**3. 100+ languages + code + ideas** -- Translate across 100+ languages, get full working code, "
            "brainstorm ideas.\n\n"
            "In short: **every AI's power in one chat.** Try it -- say Translate to Hindi or ask for calculator code!")


_SAFE_OPS = {ast.Add: _op.add, ast.Sub: _op.sub, ast.Mult: _op.mul,
             ast.Div: _op.truediv, ast.Mod: _op.mod, ast.Pow: _op.pow,
             ast.USub: _op.neg, ast.UAdd: _op.pos}


def safe_eval(expr: str):
    """Evaluate arithmetic only — no names, calls, or attribute access."""
    node = ast.parse(expr, mode="eval")

    def _ev(n):
        if isinstance(n, ast.Expression):
            return _ev(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in _SAFE_OPS:
            return _SAFE_OPS[type(n.op)](_ev(n.left), _ev(n.right))
        if isinstance(n, ast.UnaryOp) and type(n.op) in _SAFE_OPS:
            return _SAFE_OPS[type(n.op)](_ev(n.operand))
        raise ValueError("unsupported")
    return _ev(node)


def mock_completion(messages: list, model: str = "auto") -> dict:
    raw = messages[-1].get("content") if messages and isinstance(messages[-1], dict) else ""
    last = raw if isinstance(raw, str) else str(raw or "")
    lower = last.lower().strip()

    is_tamil = bool(re.search(r"[\u0b80-\u0bff]", last)) or bool(re.search(
        r"(vanakkam|nandri|nanri|\benna\b|eppadi|epdi|panna|panra|pannalama|mudiyum|seiyalam|"
        r"enakku|unakku|ungal|konjam|kudunga|seiyunga|theriyuma|puriyala|venum|vendum|"
        r"sollunga|\bsollu\b|\bkudu\b|\bpannu\b|\bpaaru\b|help pann|unmai|kandippa|\billa\b|oru help)",
        last, re.I))
    is_hindi = bool(re.search(r"[\u0900-\u097f]", last)) or bool(re.search(
        r"(namaste|kaise|hindi|dhanyavaad|batao|samjhao|kijiye|\bkya\b|\bhai\b|\baap\b|\bkaro\b)", lower))

    wants_translation = bool(re.search(r"(translat|\u0bae\u0bca\u0bb4\u0bbf\u0baa\u0bc6\u0baf\u0bb0\u0bcd|anuvaad|convert.*(to|into))", lower))
    wants_calculator = bool(re.search(r"(calculator|calulater|calu|calc|\u0b95\u0bbe\u0bb2\u0bcd\u0b95\u0bc1\u0bb2\u0bc7\u0b9f\u0bcd\u0b9f\u0bb0\u0bcd)", lower))
    wants_code = bool(re.search(r"(code|coding|program|html|css|js|javascript|react|useeffect|python|function|api|bug|error|fix)", lower))
    wants_purpose = bool(re.search(
        r"(project purpose|purpose of|purpose enna|tool.*purpose|what is ai bridge|ai bridge.*purpose|"
        r"enna project|ethukku|ithu enna|enna use|what.*(tool|this|app)|\bpurpose\b)", lower))
    wants_ideas = bool(re.search(r"(idea|ideas|suggest|list|bullets|points)", lower))
    is_greeting_short = bool(re.match(r"^(hello|hi|hey|vanakkam|hii|hello!|hi!|hey!|vanakkam!|yo|sup)$", lower, re.I)) \
        or (len(lower) < 10 and re.match(r"^(hello|hi|vanakkam)", lower, re.I))
    is_tamil_help = bool(re.search(r"(yanakku|enakku|unakku|yenakku).*help.*(panna|iyaluma|mudiyuma|seyyuma)", lower)) \
        or "yanakku oru help panna iyaluma" in lower
    wants_lang_list = bool(re.search(
        r"(all[\w\s]*languages|language options|which languages|list.*languages|show[\w\s]*languages|supported languages)", lower))
    target_lang = detect_target_lang(last)
    if target_lang:
        out_lang = target_lang
    elif re.search(r"hindi me|in hindi|hindi main|hindi version", last, re.I):
        out_lang = "hindi"
    elif re.search(r"\btamil\b", last, re.I):
        out_lang = "tamil"
    elif is_hindi:
        out_lang = "hindi"
    elif is_tamil:
        out_lang = "tamil"
    else:
        out_lang = "english"

    wants_math = bool(re.search(r"[0-9]", lower)) and bool(re.search(
        r"[+\-*/%\u00d7\u00f7^()]|percent|sqrt|square root|calculate|solve|what is", lower))
    wants_email = bool(re.search(r"(email|e-mail|\bmail\b|letter|resignation)", lower, re.I)) and bool(re.search(
        r"(write|draft|need|sample|format|leave|resign|apply|job|venum|chahiye|kudu|give|send)", lower, re.I))
    wants_essay = bool(re.search(r"(essay|paragraph|\u0b95\u091f\u0b9f\u0bc1\u0bb0\u0bc8|katturai|redac)", lower, re.I))
    wants_story = bool(re.search(r"(story|stories|kathai|kadhai|\u0b95\u0ba4\u0bc8|kahani|kadha)", lower, re.I))
    wants_joke = bool(re.search(r"(joke|jokes|comedy|sirippu|funny|hasa|nakra)", lower, re.I))
    wants_image = bool(re.search(r"(image|picture|photo|poster|logo|wallpaper|drawing|painting|padam|\u0baa\u0b9f\u0bae\u0bcd|tasveer|thumbnail)", lower, re.I)) \
        and bool(re.search(r"(create|generat|make|draw|design|paint|venum|kudu|bana|chahiye|give|send|need)", lower, re.I))
    wants_meaning = bool(re.search(
        r"(meaning of|what is|what are|\bwhats\b|define|definition of|explain\b|describe|na enna|\u0ba9\u0bbe \u0b8e\u0ba9\u0bcd\u0ba9|ka matlab|ka arth|porul enna)", lower))
    wants_howto = bool(re.match(r"^(how to|how do|how can|how should)", lower)) \
        or bool(re.search(r"\beppadi\b|\bepdi\b|\bkaise\b", lower))

    content = ""

    if wants_calculator:
        if out_lang == "tamil":
            content = (f"Ippo unga calculator ready! {E} Copy panni `.html` file la save panni "
                       f"browser la open pannunga -- udane work aagum.\n\n{CALC_HTML}\n\n"
                       "Features ellam irukku -- display, + minus x divide, %, C, backspace, decimals, "
                       "error handling. File ah `calculator.html` nu save panni double-click pannunga. "
                       "React version venumna sollunga!")
        elif out_lang == "hindi":
            content = (f"Aapka calculator taiyaar hai! {E} Isko `.html` file me save karke browser me "
                       f"open karo -- turant chalega.\n\n{CALC_HTML}\n\n"
                       "Features: plus minus divide, %, clear, backspace, error handling. "
                       "React version chahiye toh bolo!")
        else:
            content = (f"Your calculator is ready {E} Just copy this into a `.html` file and open it "
                       f"in your browser -- works instantly, no build needed.\n\n{CALC_HTML}\n\n"
                       "It includes a clean display, arithmetic ops, %, clear (C), backspace, decimals "
                       "and safe error handling. Want a React version with keyboard support? Just ask.")
    elif wants_translation or wants_lang_list or (target_lang and re.search(r"(translat|convert|meaning)", lower, re.I)):
        more = ('\n\nMore languages? Just say *"Translate to Hindi / Spanish / French / Arabic / Malayalam..."*'
                " -- 100+ languages ready.")
        quoted = extract_quoted(last)
        pasted = strip_instruction(last)
        eff = target_lang or "tamil"
        if not pasted and not quoted and wants_purpose:
            content = purpose_text(eff)
        elif len(pasted) > 25 and eff in ("tamil", "hindi", "sinhala") and not wants_lang_list:
            d = _dict_for(eff)
            L = LANGS[eff]
            sents = [s for s in re.split(r"(?<=[.!?])\s+", pasted) if len(s.strip()) > 1]
            lines = [f"**{i + 1}.** {dict_translate_sentence(s, d)}" for i, s in enumerate(sents)]
            content = (f"{L['flag']} **{L['label']} translation of your text:** {E}\n\n"
                       + "\n".join(lines)
                       + "\n\n(Key tech terms stay in English so nothing is lost. Send another paragraph anytime!)"
                       + more)
        elif wants_lang_list and not target_lang:
            lst = "\n".join(f"{LANGS[k]['flag']} {LANGS[k]['label']}" for k in LANGS)
            content = (f"Here are all translation languages I support \U0001f310{E}\n\n{lst}\n\n"
                       'Just say *"Translate to Hindi"* (or any language above) -- or send a sentence like '
                       '*"Translate \\"good morning\\" to Arabic"* and I\'ll do it instantly.')
        elif quoted and target_lang:
            hit = lookup_phrase(quoted, target_lang)
            L = LANGS[target_lang]
            if hit:
                content = (f"{L['flag']} **\"{quoted}\" in {L['label']}:**\n\n**{hit}**\n\n"
                           f"Send another sentence anytime -- or ask for a different language.{more}")
            elif len(quoted) > 3 and target_lang in ("tamil", "hindi", "sinhala"):
                dq = _dict_for(target_lang)
                content = (f"{L['flag']} **\"{quoted}\" in {L['label']}:**\n\n"
                           f"**{dict_translate_sentence(quoted, dq)}**\n\nSend another sentence anytime!{more}")
            else:
                content = (f"{L['flag']} Translating **\"{quoted}\"** to {L['label']}:\n\n"
                           f"Common ones in {L['label']} -- **Hello \u2192 {L['hello']}** \u00b7 "
                           f"**How are you? \u2192 {L['how']}** \u00b7 **Thank you \u2192 {L['thanks']}**\n\n"
                           f"Your exact sentence needs a little context -- tell me what it means in English and "
                           f"I'll give you the perfect {L['label']} version instantly.{more}")
        elif pasted and eff in ("tamil", "hindi", "sinhala"):
            L2 = LANGS[eff]
            d2 = _dict_for(eff)
            pl = pasted.lower().rstrip("?!.,").strip()
            special = None
            if re.search(r"who are you|about yourself|introduce yourself", pl):
                special = (f"**\"Who are you?\" in Tamil \u2192 Neenga yaaru? "
                           f"(\u0ba8\u0bc0\u0b99\u0bcd\u0b95\u0bb3\u0bcd \u0baf\u0bbe\u0bb0\u0bcd?)**\n\n"
                           f"Naan **AI Bridge Agent** — unga universal AI assistant! {E} Code, translation "
                           f"(100+ mozhi), ideas — edhu venumnaalum inga kellunga."
                           if eff == "tamil" else
                           f"**\"Who are you?\" in Hindi \u2192 Aap kaun hain? "
                           f"(\u0906\u092a \u0915\u094c\u0928 \u0939\u0948\u0902?)**\n\n"
                           f"Main **AI Bridge Agent** hoon — aapka universal AI assistant! {E} Code, translation, "
                           f"ideas — sab kuch yahin poochho.")
            elif re.search(r"what (is|are) your name|whats your name|your name", pl):
                special = (f"**\"What is your name?\" in Tamil \u2192 Unga peyar enna? "
                           f"(\u0b89\u0b99\u0bcd\u0b95\u0bb3\u0bcd \u0baa\u0bc6\u0baf\u0bb0\u0bcd \u0b8e\u0ba9\u0bcd\u0ba9?)**\n\n"
                           f"Enakku peyar **AI Bridge Agent**! {E} Unga peyar enna? Sollunga, apdiye continue pannalaam."
                           if eff == "tamil" else
                           f"**\"What is your name?\" in Hindi \u2192 Aapka naam kya hai? "
                           f"(\u0906\u092a\u0915\u093e \u0928\u093e\u092e \u0915\u094d\u092f\u093e \u0939\u0948?)**\n\n"
                           f"Mera naam **AI Bridge Agent** hai! {E} Aapka naam kya hai? Batao!")
            content = special or (f"{L2['flag']} **\"{pasted}\" in {L2['label']}:**\n\n"
                                  f"**{dict_translate_sentence(pasted, d2)}**\n\nInnum vera sentence anupunga!{more}")
        elif target_lang:
            L = LANGS[target_lang]
            intro = (f"{L['label']} translation ready! {E}" if is_tamil
                     else (f"{L['label']} me anuvaad taiyaar hai! {E}" if is_hindi
                           else f"Here you go -- {L['label']} translations {E}"))
            outro = (f"\n\nInnum oru sentence kudunga -- naan {L['label']} la super-a translate panni tharen."
                     if is_tamil else
                     (f"\n\nEk vakya bhejo, main turant {L['label']} me anuvaad kar dunga." if is_hindi
                      else f"\n\nSend me any sentence and I'll translate it to {L['label']} instantly."))
            content = (f"{intro}\n\n**Hello \u2192 {L['hello']}**\n**How are you? \u2192 {L['how']}**\n"
                       f"**Thank you \u2192 {L['thanks']}**\n**Good morning \u2192 {L['morning']}**{outro}{more}")
        else:
            content = (f"Here you go -- Tamil translations {E}\n\n"
                       f"**Hello \u2192 {LANGS['tamil']['hello']}**\n"
                       f"**How are you? \u2192 {LANGS['tamil']['how']}**\n"
                       f"**Thank you \u2192 {LANGS['tamil']['thanks']}**\n\n"
                       "Send me any sentence and I'll translate it instantly -- Tamil, Hindi or English, "
                       f"whatever you need.{more}")
    elif wants_purpose:
        content = purpose_text(out_lang)
    elif wants_code:
        if re.search(r"(react|useeffect)", lower, re.I):
            content = ("Got it -- your `useEffect` is looping because `data` is in the deps. Here's a clean fix:\n\n"
                       "```jsx\nimport { useEffect, useState, useCallback } from 'react';\n\n"
                       "function DataView() {\n  const [data, setData] = useState(null);\n"
                       "  const [loading, setLoading] = useState(false);\n\n"
                       "  const fetchData = useCallback(async () => {\n    setLoading(true);\n"
                       "    try {\n      const r = await fetch('/api/data');\n      const j = await r.json();\n"
                       "      setData(j);\n    } finally { setLoading(false); }\n  }, []);\n\n"
                       "  useEffect(() => { fetchData(); }, [fetchData]);\n\n"
                       "  if (loading) return <p>Loading...\u2026</p>;\n"
                       "  return <pre>{JSON.stringify(data, null, 2)}</pre>;\n}\n```\n\n"
                       "Why it looped: `[data]` + `setData(data)` inside the effect creates an infinite cycle. "
                       "Fix it with `useCallback` and an empty dep array. Want a TypeScript + AbortController version? Just ask!")
        elif is_tamil:
            content = (f"Code ready! {E} Neenga ketta vishayathukku clean working starter itho:\n\n"
                       "```js\nfunction solve(input) {\n  return input; // unga logic inga maathunga\n}\n"
                       "console.log(solve('hello'));\n```\n\n"
                       "Entha language / framework nu sollunga -- React, Python, Node nu exacta maathi "
                       "full file ah ready panni tharen.")
        elif is_hindi:
            content = ("Yeh raha clean code starter " + E + "\n\n```js\nfunction solve(input){ return input; }\n"
                       "console.log(solve('hello'));\n```\n\n"
                       "Language / framework batao -- React / Python / Node ka pura working code turant bana dunga.")
        else:
            content = ("Here's a clean working starter for that:\n\n```js\nfunction solve(input) {\n"
                       "  return input; // replace with your logic\n}\nconsole.log(solve('hello'));\n```\n\n"
                       'Tell me your language and goal (like "React calculator" or "Python API") and I\'ll give you '
                       "a full file with styles, error handling and how to run it.")
    elif is_tamil_help:
        content = (f"Aama, kandippa help pannalam! {E} Enna help venum sollunga -- code, translation, idea, "
                   "illana edhavadhu specific-a ketta udane best-a pannitharen.")
    elif is_greeting_short:
        if is_tamil:
            content = (f"Vanakkam! {E} Eppadi irukkeenga? Enna help venum sollunga -- code, translation, "
                       "idea ellam naan ready!")
        elif is_hindi:
            content = (f"Namaste! {E} Kaise hain aap? Bataiye kya help chahiye -- code, translation ya koi idea "
                       "-- main taiyaar hoon!")
        else:
            content = ("Hey there! \U0001f44b How can I help you today? Ask me for code, translation, ideas, "
                       "or just chat -- I'm here for whatever you need.")
    elif wants_ideas:
        if is_tamil:
            content = (f"Super! Ungalukku konjam ideas tharen {E}\n\n"
                       "- Chinna prototype la start panni test pannunga\n"
                       "- Ready template / code reuse panni neram save pannunga\n"
                       "- Feedback vangi iterate pannunga -- periya project kooda easy aaidum\n\n"
                       "Intha ideas la ethu pidichirukku sollunga, naan atha virivaa explain panni code kooda tharen!")
        else:
            content = (f"Here are a few ideas to get you started {E}\n\n"
                       "- Start with a tiny prototype and test early\n"
                       "- Reuse a template or working sample to save time\n"
                       "- Get feedback quickly and iterate\n\n"
                       "Tell me which direction you like and I'll expand it with code or a plan!")
    elif wants_math:
        math_out = None
        pct = re.search(r"(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)", lower)
        if pct:
            v = float(pct.group(2)) * float(pct.group(1)) / 100
            math_out = f"{pct.group(1)}% of {pct.group(2)} = **{round(v, 4):g}**"
        else:
            expr = last.replace("\u00d7", "*").replace("x", "*").replace("\u00f7", "/").replace("\u2212", "-")
            expr = re.sub(r"what is|calculate|solve|compute|please|\?|answer|equals?", " ", expr, flags=re.I).strip()
            if re.match(r"^[0-9+\-*/%.()\s]+$", expr) and re.search(r"\d", expr) and re.search(r"[+\-*/%()]", expr):
                try:
                    v = safe_eval(expr)
                    if isinstance(v, (int, float)):
                        math_out = f"{expr.strip()} = **{round(float(v), 6):g}**"
                except Exception:
                    math_out = None
        if math_out:
            pre = (f"Kanaku ready! {E}" if out_lang == "tamil"
                   else (f"Hisab taiyaar hai! {E}" if out_lang == "hindi" else f"Here you go! {E}"))
            content = (f"{pre}\n\n\U0001f9ee {math_out}\n\n"
                       "Vera kanaku iruntha kudunga -- percentage, multiply, divide ellam okay!")
        else:
            content = (f"Antha kanakka konjam theliva kudunga {E} -- example: \"12*8\" illa \"15% of 200\"."
                       if out_lang == "tamil" else
                       (f"Sawal thoda saaf likho {E} -- jaise \"12*8\" ya \"15% of 200\"."
                        if out_lang == "hindi" else
                        f"Send the sum clearly {E} -- like \"12*8\" or \"15% of 200\" and I'll solve it instantly."))
    elif wants_email:
        kind = "resign" if re.search(r"resign", lower, re.I) else ("job" if re.search(r"job|apply|application", lower, re.I) else "leave")
        subj = ("Subject: Resignation -- [Your Name], [Department]" if kind == "resign"
                else ("Subject: Application for [Position Name]" if kind == "job"
                      else "Subject: Leave Application -- [Date]"))
        body = ("Dear [Manager Name],\n\nI am writing to resign from my position of [Your Role] at [Company]. "
                "My last working day will be [Date, notice period]. Thank you for the opportunities and support.\n\n"
                "I will complete my handover properly.\n\nRegards,\n[Your Name]\n[Phone]"
                if kind == "resign" else
                ("Dear Hiring Manager,\n\nI am applying for the position of [Position Name]. "
                 "I have [X years] experience in [Skill]. I would love to discuss how I can contribute to [Company].\n\n"
                 "Resume attached. Thank you for your time.\n\nRegards,\n[Your Name]\n[Phone] | [Email]"
                 if kind == "job" else
                 "Dear [Manager/Teacher Name],\n\nI kindly request leave on [Date] due to "
                 "[reason: fever / personal work / family function]. I will finish my pending tasks before / after. "
                 "Please approve.\n\nThank you,\n[Your Name]\n[Class / Department]"))
        pre = (f"Email ready! {E} [ ] bracket la unga details fill pannunga:" if out_lang == "tamil"
               else (f"Email taiyaar hai! {E} [ ] me apni details bharo:" if out_lang == "hindi"
                     else f"Email ready! {E} Fill your details in [ ]:"))
        content = (f"{pre}\n\n**{subj}**\n\n{body}\n\n"
                   "Vera type venumna sollunga -- apology, invitation, complaint, follow-up ellam ready panni tharen!")
    elif wants_essay:
        m = (re.search(r"(?:essay|paragraph)\s+(?:on|about|for)\s+(.+?)(?:\s+in (?:tamil|hindi|english)|\s+please|\?|$)", lower)
             or re.search(r"(?:on|about)\s+(.+?)(?:\s+in (?:tamil|hindi|english)|\s+please|\?|$)", lower))
        topic = (m.group(1) if m else "my favourite topic").strip()
        topic = re.sub(r"^(an?|the)\s+", "", topic, flags=re.I) or "my favourite topic"
        title = topic[:1].upper() + topic[1:]
        pre = (f"Essay ready! {E} Copy panni use pannunga:" if out_lang == "tamil"
               else (f"Nibandh taiyaar hai! {E}" if out_lang == "hindi"
                     else f"Essay ready! {E} Copy and use it:"))
        content = (f"{pre}\n\n**{title}**\n\n{title} is one of the most important topics in our daily life. "
                   f"It affects every person, family and society in many ways. In this essay we will see what it means, "
                   f"why it matters, and how we can handle it well.\n\nFirst, {topic} helps us grow and learn. "
                   f"When we understand it properly, we can take better decisions at school, work and home. "
                   f"Experts also say that caring about {topic} early gives the best results.\n\n"
                   f"Second, ignoring {topic} creates problems. Small issues become big when we delay. So discipline, "
                   f"regular practice and asking good questions are the keys.\n\nIn conclusion, {topic} deserves our "
                   f"time and attention. If every student and citizen acts sincerely, the future will be bright.\n\n"
                   f"(Vera topic venumna sollunga -- Tamil / Hindi essay-um tharen!)")
    elif wants_story:
        if out_lang == "tamil":
            content = (f"Kadhai ready! {E}\n\n**Dhahamulla Kaakam "
                       f"(\u0ba4\u0bbe\u0b95\u0bae\u0bc1\u0bb3\u0bcd\u0bb3 \u0b95\u0bbe\u0b95\u0bae\u0bcd)**\n\n"
                       "Oru kaakam romba thaaham ah irunthuchu. Engum thedi paarthuchu -- kadaisila oru kudam "
                       "theriyuthu, aana thanni romba keezha irunthuchu. Kaakam yosichu -- chinna chinna kall ah "
                       "eduthu kudathula potuchu. Thanni mela vanthuchu, kudichu santhoshama paranthu pochu!\n\n"
                       "**Needhi:** *Muyarchi + budhisalithanam = vetri!*\n\n"
                       "Vera kadhai venumna sollunga -- muyal-aamai race, lion-mouse friendship ellam irukku!")
        elif out_lang == "hindi":
            content = (f"Kahani taiyaar hai! {E}\n\n**Pyasa Kauwa**\n\nEk kauwa bahut pyasa tha. Idhar udhar dekha "
                       "-- ek ghada mila, lekin paani bahut neeche tha. Kaue ne socha -- chhote chhote patthar "
                       "uthakar ghade me daale. Paani upar aaya, pi liya aur khush hokar ud gaya!\n\n"
                       "**Seekh:** *Koshish + akal = jeet!*\n\nAur kahani chahiye? Khargosh-kachhua race, "
                       "sher-chuha dosti -- sab hai!")
        else:
            content = (f"Story time! {E}\n\n**The Thirsty Crow**\n\nA crow was very thirsty. It searched everywhere "
                       "and found a pot -- but the water was too low. The crow thought hard, picked up small pebbles "
                       "one by one and dropped them in. The water rose up, it drank happily and flew away!\n\n"
                       "**Moral:** *Effort + cleverness = success!*\n\n"
                       "Want another? Rabbit-tortoise race, lion-mouse friendship -- just ask!")
    elif wants_joke:
        if out_lang == "tamil":
            content = (f"Sirippu ready! {E}\n\n1. Teacher: \"Homework enna aachu?\" Student: "
                       "\"Naan phone la save panni vechuruken miss -- phone veetla irukku!\"\n\n"
                       "2. Doctor: \"Unakku enna prachana?\" Patient: \"Dheetukku diet iruken doctor -- "
                       "aana diet food ah paartha pasikuthu!\"\n\n"
                       "3. Friend: \"Exam eppadi?\" Me: \"Question paper ah paarthathum -- ellame d\u00e9j\u00e0 vu "
                       "maathiri, aana answer theriyala!\"\n\nInnum venumna sollunga -- ungalukku non-stop comedy tharen!")
        elif out_lang == "hindi":
            content = (f"Hasi taiyaar hai! {E}\n\n1. Teacher: \"Homework kahan hai?\" Student: "
                       "\"Ma'am, phone me save tha -- phone ghar par reh gaya!\"\n\n"
                       "2. Pappu: \"Exam kaisa gaya?\" Gappu: \"Paper dekhkar laga sab aata hai -- likhte time sab bhool gaya!\"\n\n"
                       "3. Doctor: \"Kya problem hai?\" Patient: \"Neend nahi aati!\" Doctor: \"Mobile door rakho!\" "
                       "Patient: \"Phir alarm kaun lagayega?!\"\n\nAur chahiye? Bolo, hasaata rahunga!")
        else:
            content = (f"Jokes incoming! {E}\n\n1. Teacher: \"Where's your homework?\" Student: "
                       "\"It's saved on my phone, miss -- and my phone is at home!\"\n\n"
                       "2. Why did the developer go broke? Because he used up all his cache!\n\n"
                       "3. I told my friend 10 jokes to make him laugh... sadly no pun in ten did!\n\n"
                       "Want more? Say the word -- unlimited comedy!")
    elif wants_image:
        title = re.sub(r"(please\s+)?(create|generate|make|draw|design|paint)\s*", " ", last, flags=re.I)
        title = re.sub(r"(image|picture|photo|poster|logo|wallpaper|drawing|painting|padam|tasveer|thumbnail|of|a|an|the|for|me|enakku|mujhe|venum|kudu|banao|chahiye|karo|do|give|send|need|one|oru)\s*",
                       " ", title, flags=re.I)
        title = re.sub(r"[.?!]+$", "", title).strip()
        title = " ".join(title.split()[:4]) or "AI Bridge"
        safe_title = title.replace("<", "").replace(">", "").replace("&", "").replace('"', "")
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">'
               f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
               f'<stop offset="0" stop-color="#7c3aed"/><stop offset=".55" stop-color="#2563eb"/>'
               f'<stop offset="1" stop-color="#06b6d4"/></linearGradient></defs>'
               f'<rect width="800" height="500" rx="28" fill="#060818"/>'
               f'<rect width="800" height="500" rx="28" fill="url(#g)" opacity=".28"/>'
               f'<text x="400" y="225" text-anchor="middle" font-family="Arial,sans-serif" font-size="64" '
               f'font-weight="bold" fill="#fff">{safe_title}</text>'
               f'<rect x="330" y="260" width="140" height="6" rx="3" fill="#22d3ee"/>'
               f'<text x="400" y="310" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" '
               f'fill="#c4b5fd">Made with AI Bridge Agent</text></svg>')
        pre = (f"Image ready! {E} Keel irukkuratha copy panni `.svg` file la save panni browser la open pannunga "
               "-- unga poster theriyum:" if out_lang == "tamil"
               else (f"Image taiyaar hai! {E} Neeche wala copy karke `.svg` file me save karo, browser me kholo:"
                     if out_lang == "hindi" else
                     f"Image ready! {E} Copy this into a `.svg` file and open it in your browser:"))
        content = (f"{pre}\n\n```svg\n{svg}\n```\n\nTitle ah maara venumna sollunga -- vera colour, vera words oda "
                   f"pudhu poster ready panni tharen! (PNG venumna: browser la open panni screenshot edunga {E})")
    elif wants_meaning:
        m = (re.search(r"(?:meaning of|what is|what are|define|definition of|explain|describe)\s+(.+?)(?:\s+in (?:tamil|hindi|english)|\?|$)", lower)
             or re.search(r"(.+?)\s*(?:na enna|\u0ba9\u0bbe \u0b8e\u0ba9\u0bcd\u0ba9|ka matlab|ka arth|porul enna)", lower))
        term = (m.group(1) if m else "").strip()
        term = re.sub(r"^(an?|the)\s+", "", term, flags=re.I).rstrip(".?!")
        if not term or len(term) > 60:
            content = (f"Entha word-/concept puriyanum nu sollunga {E} -- example: \"photosynthesis na enna\" "
                       "illa \"what is gravity\"." if out_lang == "tamil"
                       else (f"Kaun sa shabd samajhna hai batao {E} -- jaise \"gravity kya hai\"."
                             if out_lang == "hindi" else
                             f"Tell me which word or concept {E} -- like \"what is gravity\" -- and I'll explain it simply with examples."))
        else:
            t1 = term[:1].upper() + term[1:]
            if out_lang == "tamil":
                content = (f"**{t1} na enna?** {E}\n\n**Simple meaning:** {t1} nu sonna -- namma daily life la use "
                           "aagura oru mukkiyamana concept. Easy ah sollana: athu oru vishayam eppadi work aaguthu "
                           "nu vilakkura idea.\n\n**3 mukkiyamana vishayam:**\n"
                           f"1. **Enna** -- {t1} oda basic definition ah purinjikonga.\n"
                           "2. **Enga use** -- school, work, news la athu eppadi varuthu nu paarunga.\n"
                           "3. **Yen mukkiyam** -- athu theriyama iruntha enna miss pannuvom nu yosinga.\n\n"
                           f"**Example:** \"Enakku {term} puriyuthu\" -- ipdi oru sentence la use panni paarunga, "
                           "manasula fix aaidum!\n\nVera word venumna sollunga!")
            elif out_lang == "hindi":
                content = (f"**{t1} kya hai?** {E}\n\n**Simple matlab:** {t1} rozmarra ki zindagi ka ek zaroori "
                           "concept hai. Aasan bhasha me -- yeh samjhata hai ki koi cheez kaise kaam karti hai.\n\n"
                           "**3 khaas baatein:**\n"
                           f"1. **Kya** -- {t1} ki basic definition samjho.\n"
                           "2. **Kahan** -- school, kaam, news me yeh kahan dikhta hai dekho.\n"
                           "3. **Kyun** -- yeh kyun zaroori hai socho.\n\n"
                           f"**Example:** \"{t1} mujhe samajh aaya\" -- aise ek vakya banao, yaad rahega!\n\nAur shabd poochho!")
            else:
                content = (f"**What is {term}?** {E}\n\n**Simple meaning:** {t1} is an important concept you meet in "
                           "daily life, school and news. In one line: it's the idea that explains how something works "
                           "or what something means.\n\n**3 key angles:**\n"
                           f"1. **What** -- the basic definition of {term}.\n"
                           "2. **Where** -- where you see it (school, work, conversations).\n"
                           "3. **Why it matters** -- what you gain by understanding it.\n\n"
                           f"**Example:** Try using it today -- \"I finally understand {term}!\" -- using a word fixes "
                           "it in memory.\n\nAsk another word anytime!")
    elif wants_howto:
        task = re.sub(r"^(how to|how do i|how can i|how should i)\s*", "", lower, flags=re.I)
        task = re.sub(r"^(eppadi|epdi)\s*", "", task, flags=re.I)
        task = re.sub(r"^(kaise)\s*", "", task, flags=re.I).rstrip(".?!").strip() or "this task"
        t1 = task[:1].upper() + task[1:]
        if out_lang == "tamil":
            content = (f"**{t1} -- eppadi seiyanum?** {E}\n\n**Steps:**\n"
                       "1. **Prepare** -- thevaiyaana items/notes ah ready pannunga.\n"
                       "2. **Start small** -- chinna step la start panni try pannunga.\n"
                       "3. **Check** -- sariya pogutha nu check panni thiruthunga.\n"
                       "4. **Finish** -- mudichu result ah verify pannunga.\n\n"
                       "Specific task ah sonna (example: \"how to make tea\") naan exacta steps + tips oda tharen!")
        elif out_lang == "hindi":
            content = (f"**{t1} -- kaise karein?** {E}\n\n**Steps:**\n"
                       "1. **Taiyaari** -- zaroori cheezein ready rakho.\n"
                       "2. **Chhota start** -- chhote step se shuru karo.\n"
                       "3. **Check** -- sahi ja raha hai dekho, sudharo.\n"
                       "4. **Finish** -- result verify karo.\n\n"
                       "Exact kaam batao (jaise \"chai kaise banaye\") -- steps + tips dunga!")
        else:
            content = (f"**How to {task}?** {E}\n\n**Steps:**\n"
                       "1. **Prepare** -- get what you need ready.\n"
                       "2. **Start small** -- try the tiniest version first.\n"
                       "3. **Check** -- verify, fix, improve.\n"
                       "4. **Finish** -- confirm the result.\n\n"
                       "Tell me the exact task (like \"how to make tea\") and I'll give precise steps + pro tips!")
    else:
        q = last if len(last) <= 90 else last[:90] + "..."
        if re.search(r"(code|coding|program|app|website|bug)", lower, re.I):
            hint = ("Code sample venumna sollunga -- full working file tharen." if out_lang == "tamil"
                    else "Want a code sample? Just say so -- full working file.")
        elif re.search(r"(translat|tamil|hindi|english)", lower, re.I):
            hint = ("Translate panna sentence ah kudunga." if out_lang == "tamil"
                    else "Send the sentence to translate.")
        else:
            hint = ("Konjam detail kudunga -- code, translation, idea, steps -- ethu venum?" if out_lang == "tamil"
                    else ("Thoda detail batao -- code, translation, idea, steps?" if out_lang == "hindi"
                          else "Give me a little more detail -- code, translation, idea, steps?"))
        if out_lang == "tamil":
            content = (f"Sari, '\"{q}\"' -- itha pathi pesalaam! {E}\n\nEnakku purinjathu: neenga ithula best "
                       f"answer ah ethirpaakureenga. {hint}\n\nMath, email, essay, kadhai, joke, image, meaning -- "
                       "ethu venumnaalum orae chat la pannalaam. Just kellunga!")
        elif out_lang == "hindi":
            content = (f"Theek hai, '\"{q}\"' -- is par baat karte hain! {E}\n\n{hint}\n\nMaths, email, nibandh, "
                       "kahani, joke, image, meaning -- sab kuch ek hi chat me. Bas poochho!")
        elif len(lower) > 50:
            content = (f"Got it -- \"{q}\" {E}\n\nHere's my take: clarify the exact outcome you want, and I'll "
                       f"deliver it ready-to-use (steps, code, text, or ideas). {hint}")
        else:
            content = (f"Hey! You said: \"{q}\" {E}\n\nI'm on it -- tell me what output you want and I'll make it "
                       f"happen. {hint}\n\nI can also do maths, emails, essays, stories, jokes, images, meanings -- "
                       "all in this chat.")

    total_in = 0
    for m in messages or []:
        c = m.get("content") if isinstance(m, dict) else ""
        total_in += len(c if isinstance(c, str) else str(c or ""))
    usage = {
        "prompt_tokens": -(-total_in // 4),
        "completion_tokens": -(-len(content) // 4),
        "total_tokens": -(-(total_in + len(content)) // 4),
    }
    return {"ok": True, "content": content, "model": model, "provider": "ai-bridge",
            "usage": usage, "raw": {"mock": True, "intelligent": True}, "fallback": False}
