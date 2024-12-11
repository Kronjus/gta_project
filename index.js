require('dotenv').config();
const pg = require('pg');

const config = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: 5432,
};

const pool = new pg.Pool(config);

pool.connect((err, client, done) => {
    if (err) throw err;
    client.query('SELECT * FROM gta_p1.user', (err, res) => {
        if (err) {
            console.log(err.stack);
        } else {
            console.log(res.rows);
        }
        pool.end();
    })
})