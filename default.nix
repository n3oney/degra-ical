{
  stdenv,
  lib,
  makeBinaryWrapper,
  bun,
  ...
}: let
  pname = "degra-ical";
  pin = lib.importJSON ./pin.json;
  src = ./.;
  packageJson = lib.importJSON "${src}/package.json";
  version = packageJson.version;
  node_modules = stdenv.mkDerivation {
    inherit src version;
    pname = "${pname}-node_modules";
    nativeBuildInputs = [bun];
    dontConfigure = true;
    buildPhase = ''
      bun install --no-progress --frozen-lockfile
    '';
    installPhase = ''
      mkdir -p $out/node_modules

      # Do not copy .cache or .bin
      cp -R ./node_modules/* $out/node_modules
      ls -la $out/node_modules
    '';
    dontFixup = true;
    dontPatchShebangs = true;
    outputHash = pin."${stdenv.system}";
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
  };
in
  stdenv.mkDerivation {
    inherit pname src version;
    buildInputs = [bun];
    nativeBuildInputs = [makeBinaryWrapper];

    dontConfigure = true;

    dontBuild = true;

    installPhase = ''
      runHook preInstall

      mkdir -p $out/bin

      cp -R ./* $out
      rm -rf $out/node_modules
      ln -s ${node_modules}/node_modules $out

      # bun is referenced naked in the package.json generated script
      makeBinaryWrapper ${bun}/bin/bun $out/bin/$pname \
        --prefix PATH : ${lib.makeBinPath [bun]} \
        --add-flags "run --prefer-offline --no-install $out/src/index.ts"

      runHook postInstall
    '';
  }

