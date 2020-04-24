const protooServer = require('protoo-server');
const http = require('http');
const cuid = require('cuid');
const url = require('url');
const config = require("./config");
const logger = require("./logger");
const Room = require("./Room");
const jwt = require("jsonwebtoken");
const mediasoup = require('mediasoup');
const express = require('express');
const app = express();

const httpServer = http.createServer(app);

// mediasoup Workers.
const mediasoupWorkers = [];

// Index of next mediasoup Worker to use.
let nextMediasoupWorkerIdx = 0;

const options =
{
    maxReceivedFrameSize: 960000, // 960 KBytes.
    maxReceivedMessageSize: 960000,
    fragmentOutgoingMessages: true,
    fragmentationThreshold: 960000
};

const rooms = new Map();

async function run() {
    await runMediasoupWorkers();

    await createRoom();

    await runExpressServer();

    await new Promise((resolve) => {
        httpServer.listen(3000, resolve);
    });

    logger.info('listening on port 3000');

    await runMediasoupServer();
}

async function createRoom() {
    const mediasoupWorker = getMediasoupWorker();

    rooms.set("default", await Room.create(mediasoupWorker));
}

async function runMediasoupServer() {
    const mediasoupServer = new protooServer.WebSocketServer(httpServer, options);

    mediasoupServer.on('connectionrequest', async (info, accept, reject) => {
        try {
            const u = url.parse(info.request.url, true);

            const token = u.query['t'];

            if(!token){
                return reject(401, 'Unauthorized');
            }

            console.log(token);

            const user = await new Promise((resolve, reject) => {
                jwt.verify(token, 'zMsFo4MHa9X20ZQuxDHsHldzxj4Iq4P3', { issuer: "CCC Monitoramento", audience: "cccfacil.com.br" }, function (err, decoded) {
                    if (err)
                        reject(err);
                    else
                        resolve(decoded);
                });
            });

            console.log(user);

            const transport = accept();

            // The app chooses a `peerId` and creates a peer within a specific room.
            const peer = await rooms.get("default").createPeer(cuid(), transport);

            peer.data.displayName = user.sub;
            peer.data.role = user.role;

            console.log('peer created %s', peer.id);

            rooms.get("default").handleConnection(peer);
        }
        catch (ex) {
            console.error(ex);
            reject(401, 'Unauthorized');
        };
    });
}

async function runExpressServer() {
    const bodyParser = require('body-parser');

    app.use(bodyParser.urlencoded({ extended: false }));

    app.use(bodyParser.json());

    app.use(function (req, res, next) {
        const token = req.headers.authorization;

        if (!token) {
            req.user = null;

            next();
        }
        else {
            jwt.verify(token, 'zMsFo4MHa9X20ZQuxDHsHldzxj4Iq4P3', { issuer: "CCC Monitoramento", audience: "cccfacil.com.br" }, function (err, decoded) {
                if (err) {
                    req.user = null;
                }
                else {
                    req.user = decoded;
                }

                next();
            });
        }
    });

    app.post('/api/user', function (req, res) {
        if (!req.user || req.user.role !== "admin") {
            return res.status(401).send('Unauthorized');
        }

        const { displayName } = req.body;

        jwt.sign({
            exp: Math.floor(Date.now() / 1000) + (60 * 15),
            iat: Math.floor(Date.now() / 1000),
            role: "user",
            sub: displayName,
            iss: "CCC Monitoramento",
            aud: "cccfacil.com.br"
        }, 'zMsFo4MHa9X20ZQuxDHsHldzxj4Iq4P3', { algorithm: 'RS256' }, function (err, token) {
            if (err)
                return res.status(500).send('Internal Server Error');

            res.status(200).send(token);
        });
    });

    app.post('/api/admin', function (req, res) {
        if (!req.user || req.user.role !== "admin") {
            return res.status(401).send('Unauthorized');
        }

        const { displayName } = req.body;

        jwt.sign({
            exp: Math.floor(Date.now() / 1000) + (60 * 15),
            iat: Math.floor(Date.now() / 1000),
            role: "admin",
            sub: displayName,
            iss: "CCC Monitoramento",
            aud: "cccfacil.com.br"
        }, 'zMsFo4MHa9X20ZQuxDHsHldzxj4Iq4P3', { algorithm: 'RS256' }, function (err, token) {
            if (err)
                return res.status(500).send('Internal Server Error');

            res.status(200).send(token);
        });
    });
}

async function runMediasoupWorkers() {
    const { numWorkers } = config.mediasoup;

    logger.info('running %d mediasoup Workers...', numWorkers);

    for (let i = 0; i < numWorkers; ++i) {
        const worker = await mediasoup.createWorker(
            {
                logLevel: config.mediasoup.workerSettings.logLevel,
                logTags: config.mediasoup.workerSettings.logTags,
                rtcMinPort: Number(config.mediasoup.workerSettings.rtcMinPort),
                rtcMaxPort: Number(config.mediasoup.workerSettings.rtcMaxPort)
            });

        worker.on('died', () => {
            logger.error(
                'mediasoup Worker died, exiting  in 2 seconds... [pid:%d]', worker.pid);

            setTimeout(() => process.exit(1), 2000);
        });

        mediasoupWorkers.push(worker);

        // Log worker resource usage every X seconds.
        setInterval(async () => {
            const usage = await worker.getResourceUsage();

            logger.info('mediasoup Worker resource usage [pid:%d]: %o', worker.pid, usage);
        }, 120000);
    }
}

/**
 * Get next mediasoup Worker.
 */
function getMediasoupWorker() {
    const worker = mediasoupWorkers[nextMediasoupWorkerIdx];

    if (++nextMediasoupWorkerIdx === mediasoupWorkers.length)
        nextMediasoupWorkerIdx = 0;

    return worker;
}


run();