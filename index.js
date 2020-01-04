const
{
    Puppet,
    MatrixAppServiceBridge:
    {
        Cli, AppServiceRegistration
    },
    MatrixPuppetBridgeBase,
    utils
} = require("./src/matrix-puppet-bridge");
const path = require('path');
const debug = require('debug');
const debugVerbose = debug('verbose:matrix-puppet:mud:index');
const MUDController = require('./src/mudcontroller');
const config = require('./config.json');


class App extends MatrixPuppetBridgeBase
{
    constructor(config, puppet, puppets)
    {
        super(config, puppet, puppets);
        this.mainUname = mainUname;
        this.mainUser = mainUser;
        this.mainPuppet = mainPuppet;
    }

    getServicePrefix() {return config.servicePrefix;}

    getServiceName() {return config.serviceName;}

    // Unicode Character 'ZERO WIDTH SPACE'
    defaultDeduplicationTag() {return " \u200b";}

    // Unicode Character 'ZERO WIDTH SPACE'
    defaultDeduplicationTagPattern() {return " \\u200b$";}

    initThirdPartyClient()
    {
        this.userId = null;
        this.clients = [];
        this.mudctlr = new MUDController(this, config,
                                         this.defaultDeduplicationTag());
        this.mudctlr.start();
    }

    getThirdPartyRoomDataById(id)
    {
        debugVerbose("getThirdPartyRoomDataById()", id)
        let roomData =
            {
                name: id,
                topic: `${config.serviceName} Chat`
            };
        return roomData;
    }

    sendMessageAsPuppetToThirdPartyRoomWithId(id, text, data)
    {
        return this.mudctlr.sendToMud(id, text, data);
    }

    sendEmoteAsPuppetToThirdPartyRoomWithId(id, text, data)
    {
        return this.mudctlr.sendEmoteToMud(id, text, data);
    }

    sendImageMessageAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _data,
                                                   _matrixEvent)
    {
        // TODO:
        console.log("sendImageMessageAsPuppetToThirdPartyRoomWithId: Generate url to send to MUD?");
        return Promise.resolve(true);
    }

    sendFileMessageAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _data,
                                                  _matrixEvent)
    {
        // TODO:
        console.log("sendFileMessageAsPuppetToThirdPartyRoomWithId: Generate url to send to MUD?");
        return Promise.resolve(true);
    }

    sendReadReceiptAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId)
    {
        // no op for a MUD
        return Promise.resolve(true);
    }
}

const mainUname = config.bridge.puppet;
const mainUser = config.users.find(user => user.mud.username == mainUname)
const mainPuppet = new Puppet(path.join(__dirname, './config.json' ),
                              config, mainUser ? mainUser.puppet : null);

new Cli({
    port: config.port,
    registrationPath: config.registrationPath,
    generateRegistration: function(reg, callback)
    {
        mainPuppet.associate().then(()=>{
            reg.setId(AppServiceRegistration.generateToken());
            reg.setHomeserverToken(AppServiceRegistration.generateToken());
            reg.setAppServiceToken(AppServiceRegistration.generateToken());
            reg.setSenderLocalpart("mudbot");
            reg.addRegexPattern("users", `@${config.servicePrefix}_.*`, true);
            reg.addRegexPattern("aliases", `#${config.servicePrefix}_.*`, true);
            callback(reg);
        }).catch(err=>{
            console.trace();
            console.error(err.message);
            process.exit(-1);
        });
    },
    run: function(port)
    {
        // Login users
        let puppets = {};
        puppets[mainUser.puppet.id] = mainPuppet;
        for (let index in config.users)
        {
            let user = config.users[index]
            if (user.mud.username == mainUname)
                continue;
            console.log(`Logging ${user.mud.username} into Matrix...`);
            let puppet = new Puppet(path.join(__dirname, './config.json' ),
                                    config, user.puppet);
            puppets[user.puppet.id] = puppet;
            puppet.startClient();
        }
        console.log("Starting app...");
        const app = new App(config, mainPuppet, puppets);
        console.log(`Logging main user ${mainUname} into Matrix...`);
        return mainPuppet.startClient().then(()=>{
            return app.initThirdPartyClient();
        }).then(() => {
            return app.bridge.run(port, config);
        }).then(()=>{
            console.log('Matrix-side listening on port %s', port);
        })
        // .catch(err=>{
        //     console.error(err.message);
        //     process.exit(-1);
        // });
    }
}).run();
