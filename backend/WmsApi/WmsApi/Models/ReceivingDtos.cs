namespace WmsApi.Models
{
    public record PalletInput
    {
        public string Code { get; set; } = string.Empty;
        public string ProductCode { get; set; } = string.Empty;
        public int Quantity { get; set; } = 0;
        public bool PackagingDamaged { get; set; } = false;
        public string? DamageDescription { get; set; } = string.Empty;
    }

    public record ReceiveRequest
    {
        public string OrderNumber { get; set; } = string.Empty;
        public List<PalletInput> Pallets { get; set; } = new List<PalletInput>();
    }

    public record StoreRequest 
    { 
        public string PalletCode { get; set; } = string.Empty;
        public string LocationCode { get; set; } = string.Empty;
    }

    public record DecisionRequest
    {
        public bool Approve { get; set; } = false;
    }

    public record CreateReplenishmentRequest
    {
        public string ProductCode { get; set; } = string.Empty;
        public string LineName { get; set; } = string.Empty;
        public int Quantity { get; set; } = 0;
        public int Priority { get; set; } = 0;
    }

    public record SendToLineRequest
    {
        public string PalletCode { get; set; } = string.Empty;
    }

    public record QuarantineRequest
    {
        public string PalletCode { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
    }

    public record QuarantineDecisionRequest
    {
        public bool Repairable { get; set; } = false;
        public string? ProtocolText { get; set; } = string.Empty;
    }

    public record PriorityRequest
    {
        public int Priority { get; set; } = 0;
    }
}
