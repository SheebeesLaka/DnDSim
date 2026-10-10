# legacy-java — the original JavaFX combat simulator

This folder holds the JavaFX application exactly as it was before the TypeScript
rebuild began. Nothing in it is modified by the rebuild; it stays here as the
reference implementation for the rules inventoried in `../FEATURES.md`
(file:line citations in that document refer to paths inside this folder).

The app reads and writes `../saves/` (the repo root `saves/` folder), the same
files the web app uses, so **run it from the repository root**.

## Requirements

- JDK 21 (any 17+ works; the code uses records and pattern `instanceof`)
- JavaFX 21 SDK (not in the repo) — download from https://gluonhq.com/products/javafx/
  and unzip somewhere, e.g. `C:\javafx-sdk-21` or `~/javafx-sdk-21`
- The jars in `legacy-java/lib/` (Gson 2.10.1, Ikonli 12.4.0) are committed

## Compile (from the repository root)

```sh
# Linux / macOS
FX=~/javafx-sdk-21/lib
javac --module-path "$FX" --add-modules javafx.controls,javafx.graphics \
  -cp "legacy-java/lib/*" -d legacy-java/bin \
  legacy-java/Main.java legacy-java/EntityRes/*.java legacy-java/Objects/*.java \
  legacy-java/UI/*.java legacy-java/UI/Battle/*.java
```

```bat
:: Windows (cmd)
set FX=C:\javafx-sdk-21\lib
javac --module-path "%FX%" --add-modules javafx.controls,javafx.graphics ^
  -cp "legacy-java\lib\*" -d legacy-java\bin ^
  legacy-java\Main.java legacy-java\EntityRes\*.java legacy-java\Objects\*.java ^
  legacy-java\UI\*.java legacy-java\UI\Battle\*.java
```

## Run (from the repository root, so `saves/` and `legacy-java/resources/` resolve)

The app loads stylesheets and sprites from a `resources/` folder relative to the
working directory, so either run it from inside `legacy-java/` with `saves`
symlinked/junctioned to `../saves`, or simply run from `legacy-java/` after
copying nothing — the simplest is:

```sh
cd legacy-java
ln -s ../saves saves        # once; on Windows: mklink /J saves ..\saves
java --module-path "$FX" --add-modules javafx.controls,javafx.graphics \
  -cp "bin:lib/*" Main      # Windows: -cp "bin;lib\*"
```

`bin/` is git-ignored.

## VS Code

`legacy-java/.vscode/` contains the original launch configuration. Open the
`legacy-java/` folder as the workspace root for the Java extension to pick up
`lib/` from `settings.json`.
