// server.js
import {Server} from "socket.io";
import http from "http";
import express from "express";
import path from "path";

class MyServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server);

        this.start();
        this.serveDashboard();
    }

    serveDashboard() {
        this.app.get("/", (req, res) => {
            const dashboardPath = new URL("./dashboard.html", import.meta.url).pathname;
            const normalizedPath = path.normalize(dashboardPath);
            //console.log(normalizedPath,dashboardPath);
            res.sendFile(normalizedPath.substring(1));
        });
    }

    start() {
        this.server.listen(0, () => {
            console.log("Dashboard server running on http://localhost:" + this.server.address().port);
        });
    }

    emitMessage(event, data) {
        this.io.emit(event, data);
    }
}
let myserver = new MyServer();
export default myserver;
