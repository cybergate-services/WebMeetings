const protooServer = require('protoo-server');
const http = require('http');
const cuid = require('cuid');
const config = require("./config");
const logger = require("./logger");
const Room = require("./Room");

const mediasoup = require('mediasoup');

const httpServer = http.createServer();

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

let server;

const rooms = new Map();

async function run() {
    await runMediasoupWorkers();

    await createRoom();

    await new Promise((resolve) =>
	{
		httpServer.listen(80, resolve);
	});

    await runServer();
}

async function createRoom() {
    let { mediaCodecs } = config.mediasoup.routerOptions;

    const mediasoupWorker = getMediasoupWorker();

    rooms.set("default", await Room.create(mediasoupWorker));
}

async function runServer() {
    server = new protooServer.WebSocketServer(httpServer, options);

    server.on('connectionrequest', async (info, accept, reject) => {
        // The app inspects the `info` object and decides whether to accept the
        // connection or not.  
        try {
            const transport = accept();

            // The app chooses a `peerId` and creates a peer within a specific room.
            const peer = await room.createPeer(cuid(), transport);

            room.handleConnection(peer);

        }
        catch (ex) {
            reject(403, 'Not Allowed');
        };
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