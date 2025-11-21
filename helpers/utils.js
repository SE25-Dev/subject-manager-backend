const fs = require('fs');

async function readFirstLine(path) {
    return new Promise((resolve, reject) => {
        const rs = fs.createReadStream(path, { encoding: "utf8" });
        let acc = "";
        let pos = 0;
        let index;
        rs.on("data", (chunk) => {
            index = chunk.indexOf("\n");
            acc += chunk;
            if (index !== -1) {
                rs.close();
            } else {
                pos += chunk.length;
            }
        })
            .on("close", () => {
                resolve(acc.slice(0, pos + index));
            })
            .on("error", (err) => {
                reject(err);
            });
    });
}

module.exports = {
    readFirstLine
};