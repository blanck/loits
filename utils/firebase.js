import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBQzh6AEIrEWsD2whyOMhzBaLlzyiT0AWc",
  authDomain: "loitsgame.firebaseapp.com",
  databaseURL: "https://loitsgame-default-rtdb.firebaseio.com",
  //databaseURL: "http://127.0.0.1:9001",
  projectId: "loitsgame",
  storageBucket: "loitsgame.firebasestorage.app",
  messagingSenderId: "525145989044",
  appId: "1:525145989044:web:bca4d61d0804ab730a5ce1",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database };
