require("dotenv").config();
var express = require("express");
var cors = require("cors");
var bodyParser = require("body-parser");

var app = express();
const http = require("http").Server(app);
var port = process.env.PORT || 3000;

if ("JWT_SECRET" in process.env === false) {
  console.error("Failed to load JWT_SECRET: Variable not set in environment.");
  process.exit(1);
}

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use("/auth", require("./routes/authentication"));

app.use("/courses", require("./routes/courses/index"));
app.use("/courses", require("./routes/courses/materials"));
app.use("/courses", require("./routes/courses/classsessions")); // might divide this further?
app.use("/courses", require("./routes/courses/assessments"));
app.use("/courses", require("./routes/courses/permissions"));
app.use("/courses", require("./routes/courses/presence"));
app.use("/courses", require("./routes/courses/management"));

app.use("/notifications", require("./routes/notifications"));

app.use("/files", require("./routes/files"));

http.listen(port, () => {
  console.log("Server running on port:" + port);
});
