# ASOIAF private corpus SQLite operator

The full holder-controlled corpus is too large for the original nested JSON positional index to remain the production path. The SQLite operator stores exact paragraph text in a private FTS5 database while keeping source filenames, original paths, and source payload out of Git.

```bash
python asoiaf/tools/asoiaf_private_corpus_sqlite.py build \
  --root /private/asoiaf-estate \
  --at 2026-08-12T02:20:00.000Z

python asoiaf/tools/asoiaf_private_corpus_sqlite.py verify \
  --database /private/asoiaf-estate/private-research/ASOIAF-PRIVATE-CORPUS.sqlite3 \
  --receipt /private/asoiaf-estate/private-research/ASOIAF-PRIVATE-CORPUS-RECEIPT.json

python asoiaf/tools/asoiaf_private_corpus_sqlite.py query \
  --database /private/asoiaf-estate/private-research/ASOIAF-PRIVATE-CORPUS.sqlite3 \
  --text "Winterfell old gods" --mode all
```

Queries return source, edition, unit, paragraph, segment, locator, and digest identity. They return no text by default. `--include-snippet` is an explicit private disclosure transaction and never makes its output repository eligible.

The database has `graphEffect=none` and `canonEffect=none`. Search rank and co-occurrence create research leads only. Promotion still requires a reviewed reconciliation transaction against the exact holder edition and locator.

## Six-edition production receipt

The first production build contains 6 editions, 458 units, 45,828 paragraph documents, and 1,882,845 source words. Its private database and receipt remain outside Git. The committed public corpus validator proves that no source text, source payload, private path, or original filename crossed into the repository.
