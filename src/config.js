const ENV = 'dev'; // Change to 'prod' when deploying
const config = {
    dev: {
        API_BASE_URL: 'http://localhost:3000/api',
        FRONTEND_BASE_URL: 'http://localhost:63342/MokshaProtocol/public'
    },
    prod: {
        API_BASE_URL: 'https://your-railway-instance.up.railway.app',
        FRONTEND_BASE_URL: 'https://yourdomain.com'
    }
};
window.API_BASE_URL = config[ENV].API_BASE_URL;
window.FRONTEND_BASE_URL = config[ENV].FRONTEND_BASE_URL;