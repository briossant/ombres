# Machine Magic Deploy d'Ombres : un seul service Node (statique + relais WebSocket) sur le port 80.
# Le contenu de ce dossier est préparé par `pnpm deploy:prepare` (server.mjs + public/ = build Vite).
{ pkgs, ... }:
let
  app = pkgs.runCommand "ombres-app" { } ''
    mkdir -p $out
    cp ${./server.mjs} $out/server.mjs
    cp -r ${./public} $out/public
  '';
in
{
  systemd.services.ombres = {
    description = "Ombres : jeu (fichiers statiques) + relais WebSocket PC/téléphones";
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    environment = {
      NODE_ENV = "production";
      HOST = "0.0.0.0";
      PORT = "80";
      OMBRES_DIST = "${app}/public";
    };
    serviceConfig = {
      ExecStart = "${pkgs.nodejs_22}/bin/node --max-old-space-size=256 ${app}/server.mjs";
      Restart = "always";
      RestartSec = 1;
      DynamicUser = true;
      AmbientCapabilities = [ "CAP_NET_BIND_SERVICE" ];
      CapabilityBoundingSet = [ "CAP_NET_BIND_SERVICE" ];
      NoNewPrivileges = true;
      LimitNOFILE = 65536;
    };
  };
}
