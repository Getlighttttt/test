namespace WmsApi.Models
{
    /// <summary>Telo POST /api/ml/alerts, ktoré posiela ML služba (JSON v camelCase).</summary>
    public record MlAlertDto
    {
        public int PredictionId { get; set; }
        public string ProductCode { get; set; } = string.Empty;   // = Product.Code (MAT-001)
        public string LineName { get; set; } = string.Empty;      // = ReplenishmentRequest.LineName
        public double RiskPercent { get; set; }                   // 0..100
        public double Threshold { get; set; }                     // kritická hranica 0..1
        public double? MinutesToStockout { get; set; }
        public int RecommendedQty { get; set; }                   // koľko doviezť
        public int Priority { get; set; } = 3;                    // 1 = najvyššia, ako v ReplenishmentRequest
        public string Message { get; set; } = string.Empty;
        public string? ModelVersion { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public record MlThresholdDto
    {
        public double CriticalThreshold { get; set; }             // napr. 0.7
    }
}
