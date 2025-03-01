{
  description = "Dev Shell for running in Nix";

  inputs = {
    flake-parts.url = "github:hercules-ci/flake-parts";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    devenv.url = "github:cachix/devenv";
  };

  nixConfig = {
    extra-trusted-public-keys = "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=";
    extra-substituters = "https://devenv.cachix.org";
  };

  outputs = inputs @ {
    self,
    nixpkgs,
    devenv,
    flake-parts,
    ...
  }:
    flake-parts.lib.mkFlake {inherit self inputs;} {
      imports = [inputs.devenv.flakeModule];
      systems = nixpkgs.lib.systems.flakeExposed;

      perSystem = {
        config,
        self',
        inputs',
        pkgs,
        lib,
        system,
        ...
      }: {
        packages.default = import ./default.nix pkgs;

        devenv.shells.default = {
          processes = {
            "dev".exec = "bun run --watach .";
          };

          scripts = {
            up = {
              exec = "devenv up";
              description = "Start background scripts up.";
            };

            dev = {
              exec = "bun run --watch .";
              description = "Watch code for changes";
            };
          };

          enterShell = ''
            export PATH="$PWD/node_modules/.bin:$PATH"

            echo "degra-ical"
            echo "🛒 Available scripts:"
            echo 🛒
            ${pkgs.gnused}/bin/sed -e 's| |••|g' -e 's|=| |' <<EOF | ${pkgs.util-linuxMinimal}/bin/column -t | ${pkgs.gnused}/bin/sed -e 's|^|🛒 |' -e 's|••| |g'
            ${lib.generators.toKeyValue {} (lib.mapAttrs (name: value: value.description) config.devenv.shells.default.scripts)}
            EOF
          '';

          packages = [
            pkgs.alejandra
            pkgs.bun

            pkgs.openssl
          ];
        };
      };
    };
}
