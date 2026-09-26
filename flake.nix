{
  description = "Ombres — party game local (Vite + React Three Fiber + serveur Node WebSocket) : environnement de dev";

  # Même branche que l'hôte Magic Deploy (NixOS 26.05) : même Node 22 en dev et en prod.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAll (pkgs:
        let
          common = with pkgs; [
            nodejs_22 # client (Vite) et serveur (relais WebSocket)
            pnpm_10
            ffmpeg-headless # outils de préparation audio
            sox
            imagemagick
            jq
          ];
          hook = ''
            export PATH="$PWD/node_modules/.bin:$PATH"
            # Captures Playwright : Chrome système s'il existe (sinon `nix develop .#full`).
            if [ -z "''${CHROME_PATH:-}" ] && command -v google-chrome >/dev/null 2>&1; then
              export CHROME_PATH="$(command -v google-chrome)"
            fi
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
          '';
        in
        {
          default = pkgs.mkShell {
            packages = common;
            shellHook = hook + ''
              echo "Ombres — pnpm install && pnpm dev  (http://localhost:8787)"
            '';
          };
          # Variante lourde : navigateur pour les captures et Python pour régénérer les voix (tools/tts).
          full = pkgs.mkShell {
            packages = common ++ (with pkgs; [ chromium python311 uv ]);
            shellHook = hook + ''
              export CHROME_PATH="''${CHROME_PATH:-${pkgs.chromium}/bin/chromium}"
            '';
          };
        });

      formatter = forAll (pkgs: pkgs.nixfmt-rfc-style);
    };
}
