# Machine Magic Deploy d'Ombres : un seul service Node (fichiers statiques + relais WebSocket), port 80.
#
# Le proxy de Magic Deploy limite une requête à ~1 Mio : on ne soumet ici que ce fichier
# et le serveur (server.mjs, bundle esbuild). Le site (build Vite, ~20 Mo) est stocké dans
# le volume persistant /var/lib/ombres et téléversé par `node tools/deploy-upload.mjs <url>`,
# authentifié par le secret UPLOAD_TOKEN (voir server/deploy.ts). Préparation : `pnpm deploy:prepare`.
{ pkgs, ... }:
let
  server = pkgs.runCommand "ombres-server" { } ''
    mkdir -p $out
    cp ${./server.mjs} $out/server.mjs
  '';
in
{
  users.users.ombres = {
    isSystemUser = true;
    group = "ombres";
    home = "/var/lib/ombres";
  };
  users.groups.ombres = { };
  systemd.tmpfiles.rules = [ "d /var/lib/ombres 0750 ombres ombres -" ];

  systemd.services.ombres = {
    description = "Ombres : jeu (fichiers statiques) + relais WebSocket PC/téléphones";
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    environment = {
      NODE_ENV = "production";
      HOST = "0.0.0.0";
      PORT = "80";
      OMBRES_DIST = "/var/lib/ombres/site";
      OMBRES_UPLOAD_TOKEN_FILE = "/run/ombres/upload-token";
    };
    serviceConfig = {
      User = "ombres";
      Group = "ombres";
      RuntimeDirectory = "ombres";
      # Le secret (root) est recopié, lisible par le seul utilisateur du service.
      ExecStartPre = "+${pkgs.bash}/bin/bash -c 'if [ -f /run/magic-secrets/UPLOAD_TOKEN ]; then ${pkgs.coreutils}/bin/install -m 0400 -o ombres -g ombres /run/magic-secrets/UPLOAD_TOKEN /run/ombres/upload-token; fi'";
      ExecStart = "${pkgs.nodejs_22}/bin/node --max-old-space-size=256 ${server}/server.mjs";
      Restart = "always";
      RestartSec = 1;
      AmbientCapabilities = [ "CAP_NET_BIND_SERVICE" ];
      CapabilityBoundingSet = [ "CAP_NET_BIND_SERVICE" ];
      NoNewPrivileges = true;
      LimitNOFILE = 65536;
    };
  };
}
