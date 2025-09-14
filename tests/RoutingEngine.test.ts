import { describe, it, expect, beforeEach } from "vitest";
import { uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_NO_PREDICTION = 101;
const ERR_INVALID_PATH = 102;
const ERR_INVALID_FEE = 103;
const ERR_INVALID_TOLERANCE = 104;
const ERR_INVALID_PATH_LIST = 105;
const ERR_PATH_NOT_REGISTERED = 106;
const ERR_INVALID_RISK_LEVEL = 107;
const ERR_INVALID_TIME_ESTIMATE = 108;
const ERR_NO_VALID_PATHS = 109;
const ERR_INVALID_UPDATE_PARAM = 110;
const ERR_UPDATE_NOT_ALLOWED = 111;
const ERR_MAX_PATHS_EXCEEDED = 112;
const ERR_INVALID_PRIORITY = 113;
const ERR_INVALID_WEIGHT = 114;
const ERR_ORACLE_NOT_SET = 115;
const ERR_INVALID_OWNER = 116;
const ERR_HISTORY_ALREADY_EXISTS = 117;
const ERR_HISTORY_NOT_FOUND = 118;
const ERR_INVALID_HISTORY_ID = 119;
const ERR_INVALID_STATUS = 120;

interface Prediction {
  fee: number;
  riskLevel: number;
  timeEstimate: number;
  timestamp: number;
  priority: number;
}

interface History {
  selectedPath: number;
  actualFee: number;
  user: string;
  timestamp: number;
  status: boolean;
}

interface Weight {
  feeWeight: number;
  riskWeight: number;
  timeWeight: number;
}

interface Selection {
  bestPath: number;
  bestScore: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class RoutingEngineMock {
  state: {
    owner: string;
    oracleContract: string;
    maxPaths: number;
    selectionFee: number;
    nextHistoryId: number;
    fallbackPath: number;
    feeTolerance: number;
    riskThreshold: number;
    timeThreshold: number;
    pathPredictions: Map<number, Prediction>;
    selectionHistory: Map<number, History>;
    pathWeights: Map<number, Weight>;
    pathStatus: Map<number, boolean>;
  } = {
    owner: "ST1TEST",
    oracleContract: "SP000000000000000000002Q6VF78",
    maxPaths: 50,
    selectionFee: 500,
    nextHistoryId: 0,
    fallbackPath: 0,
    feeTolerance: 10,
    riskThreshold: 20,
    timeThreshold: 3600,
    pathPredictions: new Map(),
    selectionHistory: new Map(),
    pathWeights: new Map(),
    pathStatus: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  events: Array<{ event: string; data: any }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      owner: "ST1TEST",
      oracleContract: "SP000000000000000000002Q6VF78",
      maxPaths: 50,
      selectionFee: 500,
      nextHistoryId: 0,
      fallbackPath: 0,
      feeTolerance: 10,
      riskThreshold: 20,
      timeThreshold: 3600,
      pathPredictions: new Map(),
      selectionHistory: new Map(),
      pathWeights: new Map(),
      pathStatus: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.events = [];
  }

  getOwner(): Result<string> {
    return { ok: true, value: this.state.owner };
  }

  getPrediction(pathId: number): Prediction | null {
    return this.state.pathPredictions.get(pathId) || null;
  }

  getHistory(historyId: number): History | null {
    return this.state.selectionHistory.get(historyId) || null;
  }

  getPathWeight(pathId: number): Weight | null {
    return this.state.pathWeights.get(pathId) || null;
  }

  isPathActive(pathId: number): boolean {
    return this.state.pathStatus.get(pathId) || false;
  }

  selectBestPath(pathIds: number[]): Selection {
    if (pathIds.length === 0 || pathIds.length > 20) {
      return { bestPath: 0, bestScore: 0 };
    }
    if (this.state.oracleContract === "SP000000000000000000002Q6VF78") {
      return { bestPath: 0, bestScore: 0 };
    }
    let bestPath = this.state.fallbackPath;
    let bestScore = 999999999;
    for (const pathId of pathIds) {
      const prediction = this.getPrediction(pathId);
      const weights = this.getPathWeight(pathId);
      if (prediction && weights) {
        const score = this.calculateScore(prediction, weights);
        if (score < bestScore) {
          bestScore = score;
          bestPath = pathId;
        }
      }
    }
    return { bestPath, bestScore };
  }

  private calculateScore(prediction: Prediction, weights: Weight): number {
    const feeScore = (prediction.fee * weights.feeWeight) / 100;
    const riskScore = (prediction.riskLevel * weights.riskWeight) / 100;
    const timeScore = (prediction.timeEstimate * weights.timeWeight) / 100;
    const priorityBoost = prediction.priority * 10;
    return feeScore + riskScore + timeScore + priorityBoost;
  }

  updatePrediction(pathId: number, fee: number, riskLevel: number, timeEstimate: number, priority: number): Result<boolean> {
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    if (!this.isPathActive(pathId)) return { ok: false, value: false };
    if (fee <= 0) return { ok: false, value: false };
    if (riskLevel > 100) return { ok: false, value: false };
    if (timeEstimate <= 0) return { ok: false, value: false };
    if (priority > 10) return { ok: false, value: false };
    this.state.pathPredictions.set(pathId, { fee, riskLevel, timeEstimate, timestamp: this.blockHeight, priority });
    this.events.push({ event: "prediction-updated", data: { pathId } });
    return { ok: true, value: true };
  }

  setPathWeight(pathId: number, feeWeight: number, riskWeight: number, timeWeight: number): Result<boolean> {
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    if (!this.isPathActive(pathId)) return { ok: false, value: false };
    if (feeWeight <= 0 || feeWeight > 100) return { ok: false, value: false };
    if (riskWeight <= 0 || riskWeight > 100) return { ok: false, value: false };
    if (timeWeight <= 0 || timeWeight > 100) return { ok: false, value: false };
    this.state.pathWeights.set(pathId, { feeWeight, riskWeight, timeWeight });
    this.events.push({ event: "weight-updated", data: { pathId } });
    return { ok: true, value: true };
  }

  registerPath(pathId: number): Result<boolean> {
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    if (this.isPathActive(pathId)) return { ok: false, value: false };
    if (pathId >= this.state.maxPaths) return { ok: false, value: false };
    this.state.pathStatus.set(pathId, true);
    this.events.push({ event: "path-registered", data: { pathId } });
    return { ok: true, value: true };
  }

  deactivatePath(pathId: number): Result<boolean> {
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    if (!this.isPathActive(pathId)) return { ok: false, value: false };
    this.state.pathStatus.set(pathId, false);
    this.events.push({ event: "path-deactivated", data: { pathId } });
    return { ok: true, value: true };
  }

  logSelection(selectedPath: number, actualFee: number, status: boolean): Result<number> {
    if (!this.isPathActive(selectedPath)) return { ok: false, value: ERR_PATH_NOT_REGISTERED };
    if (actualFee <= 0) return { ok: false, value: ERR_INVALID_FEE };
    const historyId = this.state.nextHistoryId;
    this.state.selectionHistory.set(historyId, { selectedPath, actualFee, user: this.caller, timestamp: this.blockHeight, status });
    this.state.nextHistoryId++;
    this.events.push({ event: "selection-logged", data: { historyId } });
    return { ok: true, value: historyId };
  }

  updateFallbackPath(newPath: number): Result<boolean> {
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    if (!this.isPathActive(newPath)) return { ok: false, value: false };
    this.state.fallbackPath = newPath;
    this.events.push({ event: "fallback-updated", data: { path: newPath } });
    return { ok: true, value: true };
  }

  setFeeTolerance(newTolerance: number): Result<boolean> {
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    if (newTolerance > 50) return { ok: false, value: false };
    this.state.feeTolerance = newTolerance;
    this.events.push({ event: "tolerance-updated", data: { tolerance: newTolerance } });
    return { ok: true, value: true };
  }

  setRiskThreshold(newThreshold: number): Result<boolean> {
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    if (newThreshold > 100) return { ok: false, value: false };
    this.state.riskThreshold = newThreshold;
    this.events.push({ event: "risk-threshold-updated", data: { threshold: newThreshold } });
    return { ok: true, value: true };
  }

  setTimeThreshold(newThreshold: number): Result<boolean> {
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    if (newThreshold <= 0) return { ok: false, value: false };
    this.state.timeThreshold = newThreshold;
    this.events.push({ event: "time-threshold-updated", data: { threshold: newThreshold } });
    return { ok: true, value: true };
  }

  setMaxPaths(newMax: number): Result<boolean> {
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    if (newMax <= 0) return { ok: false, value: false };
    this.state.maxPaths = newMax;
    this.events.push({ event: "max-paths-updated", data: { max: newMax } });
    return { ok: true, value: true };
  }

  setSelectionFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    if (newFee <= 0) return { ok: false, value: false };
    this.state.selectionFee = newFee;
    this.events.push({ event: "selection-fee-updated", data: { fee: newFee } });
    return { ok: true, value: true };
  }

  setOracleContract(newOracle: string): Result<boolean> {
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    if (newOracle === "SP000000000000000000002Q6VF78") return { ok: false, value: false };
    this.state.oracleContract = newOracle;
    this.events.push({ event: "oracle-updated", data: { oracle: newOracle } });
    return { ok: true, value: true };
  }

  transferOwnership(newOwner: string): Result<boolean> {
    if (this.caller !== this.state.owner) return { ok: false, value: false };
    if (newOwner === this.caller) return { ok: false, value: false };
    this.state.owner = newOwner;
    this.events.push({ event: "ownership-transferred", data: { newOwner } });
    return { ok: true, value: true };
  }

  getBestPath(pathIds: number[]): Result<number> {
    const selection = this.selectBestPath(pathIds);
    if (selection.bestPath === this.state.fallbackPath) {
      return { ok: false, value: ERR_NO_VALID_PATHS };
    }
    return { ok: true, value: selection.bestPath };
  }

  getHistoryCount(): Result<number> {
    return { ok: true, value: this.state.nextHistoryId };
  }

  getFallbackPath(): Result<number> {
    return { ok: true, value: this.state.fallbackPath };
  }

  getFeeTolerance(): Result<number> {
    return { ok: true, value: this.state.feeTolerance };
  }

  getRiskThreshold(): Result<number> {
    return { ok: true, value: this.state.riskThreshold };
  }

  getTimeThreshold(): Result<number> {
    return { ok: true, value: this.state.timeThreshold };
  }

  getMaxPaths(): Result<number> {
    return { ok: true, value: this.state.maxPaths };
  }

  getSelectionFee(): Result<number> {
    return { ok: true, value: this.state.selectionFee };
  }

  getOracleContract(): Result<string> {
    return { ok: true, value: this.state.oracleContract };
  }
}

describe("RoutingEngine", () => {
  let contract: RoutingEngineMock;

  beforeEach(() => {
    contract = new RoutingEngineMock();
    contract.reset();
  });

  it("registers a path successfully", () => {
    const result = contract.registerPath(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.isPathActive(1)).toBe(true);
    expect(contract.events).toEqual([{ event: "path-registered", data: { pathId: 1 } }]);
  });

  it("rejects registering an existing path", () => {
    contract.registerPath(1);
    const result = contract.registerPath(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects registering beyond max paths", () => {
    const result = contract.registerPath(51);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("deactivates a path successfully", () => {
    contract.registerPath(1);
    const result = contract.deactivatePath(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.isPathActive(1)).toBe(false);
    expect(contract.events).toContainEqual({ event: "path-deactivated", data: { pathId: 1 } });
  });

  it("rejects deactivating non-registered path", () => {
    const result = contract.deactivatePath(2);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("updates prediction successfully", () => {
    contract.registerPath(1);
    const result = contract.updatePrediction(1, 100, 10, 300, 5);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const prediction = contract.getPrediction(1);
    expect(prediction?.fee).toBe(100);
    expect(prediction?.riskLevel).toBe(10);
    expect(prediction?.timeEstimate).toBe(300);
    expect(prediction?.priority).toBe(5);
    expect(contract.events).toContainEqual({ event: "prediction-updated", data: { pathId: 1 } });
  });

  it("rejects update prediction for invalid fee", () => {
    contract.registerPath(1);
    const result = contract.updatePrediction(1, 0, 10, 300, 5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets path weight successfully", () => {
    contract.registerPath(1);
    const result = contract.setPathWeight(1, 40, 30, 30);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const weight = contract.getPathWeight(1);
    expect(weight?.feeWeight).toBe(40);
    expect(weight?.riskWeight).toBe(30);
    expect(weight?.timeWeight).toBe(30);
    expect(contract.events).toContainEqual({ event: "weight-updated", data: { pathId: 1 } });
  });

  it("rejects set path weight for invalid weight", () => {
    contract.registerPath(1);
    const result = contract.setPathWeight(1, 0, 30, 30);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("selects best path successfully", () => {
    contract.setOracleContract("ST2TEST");
    contract.registerPath(1);
    contract.registerPath(2);
    contract.updatePrediction(1, 100, 10, 300, 5);
    contract.setPathWeight(1, 40, 30, 30);
    contract.updatePrediction(2, 150, 15, 400, 3);
    contract.setPathWeight(2, 40, 30, 30);
    const selection = contract.selectBestPath([1, 2]);
    expect(selection.bestPath).toBe(1);
  });

  it("returns fallback if no valid paths", () => {
    contract.setOracleContract("ST2TEST");
    const selection = contract.selectBestPath([3, 4]);
    expect(selection.bestPath).toBe(0);
  });

  it("logs selection successfully", () => {
    contract.registerPath(1);
    const result = contract.logSelection(1, 100, true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const history = contract.getHistory(0);
    expect(history?.selectedPath).toBe(1);
    expect(history?.actualFee).toBe(100);
    expect(history?.user).toBe("ST1TEST");
    expect(history?.status).toBe(true);
    expect(contract.events).toContainEqual({ event: "selection-logged", data: { historyId: 0 } });
  });

  it("rejects log selection for invalid path", () => {
    const result = contract.logSelection(3, 100, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PATH_NOT_REGISTERED);
  });

  it("updates fallback path successfully", () => {
    contract.registerPath(1);
    const result = contract.updateFallbackPath(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getFallbackPath().value).toBe(1);
    expect(contract.events).toContainEqual({ event: "fallback-updated", data: { path: 1 } });
  });

  it("sets fee tolerance successfully", () => {
    const result = contract.setFeeTolerance(20);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getFeeTolerance().value).toBe(20);
    expect(contract.events).toContainEqual({ event: "tolerance-updated", data: { tolerance: 20 } });
  });

  it("rejects invalid fee tolerance", () => {
    const result = contract.setFeeTolerance(60);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets risk threshold successfully", () => {
    const result = contract.setRiskThreshold(30);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getRiskThreshold().value).toBe(30);
  });

  it("sets time threshold successfully", () => {
    const result = contract.setTimeThreshold(7200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getTimeThreshold().value).toBe(7200);
  });

  it("sets max paths successfully", () => {
    const result = contract.setMaxPaths(100);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getMaxPaths().value).toBe(100);
  });

  it("sets selection fee successfully", () => {
    const result = contract.setSelectionFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getSelectionFee().value).toBe(1000);
  });

  it("sets oracle contract successfully", () => {
    const result = contract.setOracleContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getOracleContract().value).toBe("ST2TEST");
  });

  it("transfers ownership successfully", () => {
    const result = contract.transferOwnership("ST3NEW");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getOwner().value).toBe("ST3NEW");
  });

  it("rejects transfer to same owner", () => {
    const result = contract.transferOwnership("ST1TEST");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("gets best path successfully", () => {
    contract.setOracleContract("ST2TEST");
    contract.registerPath(1);
    contract.updatePrediction(1, 100, 10, 300, 5);
    contract.setPathWeight(1, 40, 30, 30);
    const result = contract.getBestPath([1]);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
  });

  it("rejects get best path with no valid paths", () => {
    contract.setOracleContract("ST2TEST");
    const result = contract.getBestPath([3]);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NO_VALID_PATHS);
  });

  it("gets history count correctly", () => {
    contract.registerPath(1);
    contract.logSelection(1, 100, true);
    const result = contract.getHistoryCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
  });

  it("parses path id with Clarity", () => {
    const cv = uintCV(1);
    expect(cv.value).toEqual(BigInt(1));
  });

  it("rejects actions from non-owner", () => {
    contract.caller = "ST4FAKE";
    const result = contract.registerPath(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});