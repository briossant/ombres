{
  description = "Ombres — party game local (Vite + React Three Fiber + serveur Node WebSocket)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in {
      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            pnpm
            ffmpeg      # conversion/normalisation audio (outils de génération d'assets)
            sox
            imagemagick
          ];
          shellHook = ''
            echo "Ombres — shell de dev : pnpm install && pnpm dev"
          '';
        };
      });
    };
}
