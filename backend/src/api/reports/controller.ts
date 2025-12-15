import { Request, Response } from 'express';
import { getDailyStats, getOrderHistory, getSalesByDateRange } from '../../services/orderService';

export const getStatsHandler = async (_req: Request, res: Response) => {
  try {
    const stats = await getDailyStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Error fetching stats' });
  }
};

export const getHistoryHandler = async (_req: Request, res: Response) => {
  try {
    const history = await getOrderHistory();
    res.json(history);
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({ error: 'Error fetching history' });
  }
};

export const getRangeReportHandler = async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'Fechas requeridas (start, end)' });
    }
    const report = await getSalesByDateRange(String(start), String(end));
    res.json(report);
  } catch (error) {
    console.error('Error fetching range report:', error);
    res.status(500).json({ error: 'Error generando reporte' });
  }
};
