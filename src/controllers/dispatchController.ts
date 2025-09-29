import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import AppError from "../utils/AppErrors";

export const updateDispatchProcessStatus = async (
  req: Request,
  res: Response
) => {
  const { dispatchProcessId } = req.params;
  const { status } = req.body;

  // Validate status
  if (!["start", "stop"].includes(status)) {
    throw new AppError('Invalid status value. Must be "start" or "stop"', 400);
  }

  // Find the dispatch process
  const dispatchProcess = await prisma.dispatchProcess.findUnique({
    where: { id: Number(dispatchProcessId) },
  });
  if (!dispatchProcess) {
    throw new AppError("Dispatch process not found", 404);
  }

  // Determine new status for dispatchProcess table
  let newStatus = dispatchProcess.status;
  if (status === "start") {
    newStatus = "in_progress";
  } else if (status === "stop") {
    newStatus = "accept";
  }

  // Update the dispatch process status
  const updatedDispatchProcess = await prisma.dispatchProcess.update({
    where: { id: Number(dispatchProcessId) },
    data: { status: newStatus },
  });

  res.status(200).json({
    success: true,
    data: updatedDispatchProcess,
    message: `Dispatch process status updated to ${newStatus}`,
  });
};
