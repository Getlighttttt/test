namespace WmsApi.Models;

public record CreateMaterialRequest(string Code, string Name, string Unit);
public record UpdateMaterialRequest(string Name, string Unit);
public record CreateProductionLineRequest(string Code, string Name, string Location);
public record UpdateProductionLineRequest(string Name, string Location);
public record CreateOrderItemRequest(string ProductCode, int ExpectedQty);
public record CreateOrderRequest(string OrderNumber, string SupplierName, List<CreateOrderItemRequest> Items);
