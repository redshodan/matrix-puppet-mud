# matrix-puppet-mud
This is a Matrix bridge for MUDs.
It logs in as (aka "puppets") both your matrix user and your MUD user to
establish the bridge. For more information, see:
https://github.com/AndrewJDR/matrix-puppet-bridge

This code is based on the matrix-puppet-hangouts bridge, see:
https://github.com/matrix-hacks/matrix-puppet-hangouts

## installation

clone this repo

cd into the directory

run `npm install`

## configure

Copy `config.sample.json` to `config.json` and update it to match your setup

### register the app service

Generate a `mud-registration.yaml` file with `node index.js -r -u "http://your-bridge-server:8090"`

Note: The 'registration' setting in the config.json needs to set to the path of this file. By default, it already is.

Copy this `mud-registration.yaml` file to your home server, then edit it, setting its url to point to your bridge server. e.g. `url: 'http://your-bridge-server.example.org:8090'`

Edit your homeserver.yaml file and update the `app_service_config_files` with the path to the `mud-registration.yaml` file.

Launch the bridge with ```npm start```.

Restart your HS.
