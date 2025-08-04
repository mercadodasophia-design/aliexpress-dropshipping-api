import express from "express";
import dotenv from "dotenv";
import aliexpressRoutes from "./src/routes/aliexpress.js";

dotenv.config({ path: './config.env' });
const app = express();
app.use(express.json());

app.use("/api/aliexpress", aliexpressRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
