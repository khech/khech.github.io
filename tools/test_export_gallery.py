"""Archive-to-site contract checks; run with python -m unittest discover -s tools."""
import importlib.util
import unittest
from pathlib import Path


class ExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('export_gallery', Path(__file__).with_name('export-gallery.py'))
        cls.export = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.export)

    def test_current_dimensions_and_missing_values(self):
        self.assertEqual(self.export.parse_dimensions('16×16'), ([16, 16], 'S'))
        self.assertEqual(self.export.parse_dimensions('30×40 each'), ([30, 40], 'M'))
        self.assertEqual(self.export.parse_dimensions('70×100 cm'), ([70, 100], 'L'))
        with self.assertRaises(ValueError):
            self.export.parse_dimensions('')

    def test_all_streets_and_only_existing_abstracts_are_selected(self):
        works, _ = self.export.build_catalog()
        streets = [w for w in works if w['series'] == 'Streets']
        self.assertEqual(len(streets), 23)
        self.assertEqual(len({w['id'] for w in works}), 26)
        self.assertEqual({w['id'] for w in works if w['series'] != 'Streets'},
                         {'ABS-TBS-23-05', 'ABS-MOW-18-10', 'ABS-MOW-18-01'})
        by_id = {w['id']: w for w in works}
        self.assertEqual(by_id['STR-M-TBS-26-01']['location'], 'Tbilisi')
        self.assertEqual(by_id['STR-M-TBS-26-01']['subseries'], 'Streets Mini')
        self.assertTrue(by_id['STR-M-TBS-26-01']['sold'])
        self.assertEqual(by_id['STR-TBS-26-TEETH-01']['price'], '300 USD')
        self.assertEqual(by_id['STR-TBS-26-GG']['title'], 'Golden Georgia')
        self.assertEqual(by_id['STR-M-TBS-26-01']['sources'][0].name,
                         'STR-M-TBS-26-01__IMG-009__crop.jpg')
        for work in works:
            self.assertTrue(all(source.is_file() for source in work['sources']), work['id'])
            self.assertTrue(all(source.name.startswith(work['id'] + '__') for source in work['sources']))

    def test_every_painting_subseries_resolves_to_a_main_series(self):
        _, hierarchy = self.export.build_catalog()
        self.assertEqual(hierarchy['Streets Mini'], 'Streets')
        self.assertEqual(hierarchy['Tbilisi Streets Teeth'], 'Streets')
        self.assertEqual(hierarchy['Pink and Yellow'], 'Abstract Begining')
        self.assertTrue(set(hierarchy.values()) <= {'Streets', 'Abstract Begining', 'Abstract Tbilisi'})


if __name__ == '__main__':
    unittest.main()
