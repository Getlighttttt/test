using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WmsApi.Data;
using WmsApi.Models;

namespace WmsApi.Controllers;

[ApiController]
[Route("api/master-data")]
[Authorize(Roles = "Dispecer")]
public class MasterDataController : ControllerBase
{
    private readonly Db1Context _db;
    public MasterDataController(Db1Context db) => _db = db;

    [HttpGet("materials")]
    public async Task<IActionResult> GetMaterials()
    {
        var rows = await _db.Products.AsNoTracking().OrderBy(x => x.Code)
            .Select(x => new { id = x.Id, code = x.Code, name = x.Name, unit = x.Unit, isActive = x.IsActive })
            .ToListAsync();
        return Ok(rows);
    }

    [HttpPost("materials")]
    public async Task<IActionResult> CreateMaterial(CreateMaterialRequest req)
    {
        var code = req.Code?.Trim().ToUpperInvariant();
        var name = req.Name?.Trim();
        var unit = req.Unit?.Trim();
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(unit))
            return BadRequest(new { message = "Code, name and unit are required." });
        if (code.Length > 32 || name.Length > 120 || unit.Length > 16)
            return BadRequest(new { message = "One or more fields are too long." });
        if (await _db.Products.AnyAsync(x => x.Code == code))
            return Conflict(new { message = "A material with this code already exists." });

        var product = new Product { Code = code, Name = name, Unit = unit, IsActive = true };
        _db.Products.Add(product);
        await _db.SaveChangesAsync();
        return Ok(new { id = product.Id, message = "Material created." });
    }

    [HttpPut("materials/{id:int}")]
    public async Task<IActionResult> UpdateMaterial(int id, UpdateMaterialRequest req)
    {
        var product = await _db.Products.FindAsync(id);
        if (product == null) return NotFound(new { message = "Material not found." });
        var name = req.Name?.Trim();
        var unit = req.Unit?.Trim();
        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(unit))
            return BadRequest(new { message = "Name and unit are required." });
        product.Name = name;
        product.Unit = unit;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Material updated." });
    }

    [HttpPost("materials/{id:int}/deactivate")]
    public async Task<IActionResult> DeactivateMaterial(int id)
    {
        var product = await _db.Products.FindAsync(id);
        if (product == null) return NotFound(new { message = "Material not found." });
        product.IsActive = false;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Material deactivated. Historical records were preserved." });
    }

    [HttpPost("materials/{id:int}/activate")]
    public async Task<IActionResult> ActivateMaterial(int id)
    {
        var product = await _db.Products.FindAsync(id);
        if (product == null) return NotFound(new { message = "Material not found." });
        product.IsActive = true;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Material activated." });
    }

    [HttpGet("orders")]
    public async Task<IActionResult> GetOrders()
    {
        var rows = await _db.Orders.AsNoTracking().Include(x => x.Items).ThenInclude(x => x.Product)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new {
                id = x.Id, orderNumber = x.OrderNumber, supplierName = x.SupplierName,
                status = x.Status, createdAt = x.CreatedAt,
                items = x.Items.Select(i => new { productCode = i.Product!.Code, productName = i.Product.Name, expectedQty = i.ExpectedQty, unit = i.Product.Unit })
            }).ToListAsync();
        return Ok(rows);
    }

    [HttpPost("orders")]
    public async Task<IActionResult> CreateOrder(CreateOrderRequest req)
    {
        var number = req.OrderNumber?.Trim().ToUpperInvariant();
        var supplier = req.SupplierName?.Trim();
        if (string.IsNullOrWhiteSpace(number) || string.IsNullOrWhiteSpace(supplier))
            return BadRequest(new { message = "Order number and supplier are required." });
        if (req.Items == null || req.Items.Count == 0)
            return BadRequest(new { message = "Add at least one material to the order." });
        if (await _db.Orders.AnyAsync(x => x.OrderNumber == number))
            return Conflict(new { message = "An order with this number already exists." });

        var codes = req.Items.Select(x => x.ProductCode?.Trim().ToUpperInvariant()).ToList();
        if (codes.Any(string.IsNullOrWhiteSpace) || codes.Distinct().Count() != codes.Count)
            return BadRequest(new { message = "Each material can appear only once in an order." });
        if (req.Items.Any(x => x.ExpectedQty <= 0))
            return BadRequest(new { message = "Expected quantities must be greater than zero." });

        var products = await _db.Products.Where(p => codes.Contains(p.Code) && p.IsActive).ToListAsync();
        if (products.Count != codes.Count)
            return BadRequest(new { message = "One or more materials do not exist or are inactive." });

        var order = new Order {
            OrderNumber = number,
            SupplierName = supplier,
            Status = "OPEN",
            Items = req.Items.Select(item => new OrderItem {
                ProductId = products.Single(p => p.Code == item.ProductCode.Trim().ToUpperInvariant()).Id,
                ExpectedQty = item.ExpectedQty
            }).ToList()
        };
        _db.Orders.Add(order);
        await _db.SaveChangesAsync();
        return Ok(new { id = order.Id, orderNumber = order.OrderNumber, message = "Order created." });
    }

    [HttpGet("lines")]
    public async Task<IActionResult> GetLines()
    {
        var rows = await _db.ProductionLines.AsNoTracking().OrderBy(x => x.Code)
            .Select(x => new { id = x.Id, code = x.Code, name = x.Name, location = x.Location, isActive = x.IsActive })
            .ToListAsync();
        return Ok(rows);
    }

    [HttpPost("lines")]
    public async Task<IActionResult> CreateLine(CreateProductionLineRequest req)
    {
        var code = req.Code?.Trim().ToUpperInvariant();
        var name = req.Name?.Trim();
        var location = req.Location?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Line code and name are required." });
        if (code.Length > 32 || name.Length > 120 || location.Length > 160)
            return BadRequest(new { message = "One or more fields are too long." });
        if (await _db.ProductionLines.AnyAsync(x => x.Code == code))
            return Conflict(new { message = "A production line with this code already exists." });
        var line = new ProductionLine { Code = code, Name = name, Location = location, IsActive = true };
        _db.ProductionLines.Add(line);
        await _db.SaveChangesAsync();
        return Ok(new { id = line.Id, message = "Production line created." });
    }

    [HttpPut("lines/{id:int}")]
    public async Task<IActionResult> UpdateLine(int id, UpdateProductionLineRequest req)
    {
        var line = await _db.ProductionLines.FindAsync(id);
        if (line == null) return NotFound(new { message = "Production line not found." });
        var name = req.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Line name is required." });
        line.Name = name;
        line.Location = req.Location?.Trim() ?? "";
        await _db.SaveChangesAsync();
        return Ok(new { message = "Production line updated." });
    }

    [HttpPost("lines/{id:int}/deactivate")]
    public async Task<IActionResult> DeactivateLine(int id)
    {
        var line = await _db.ProductionLines.FindAsync(id);
        if (line == null) return NotFound(new { message = "Production line not found." });
        var hasOpenRequests = await _db.ReplenishmentRequests.AnyAsync(x => x.LineName == line.Code && x.Status != "DONE");
        if (hasOpenRequests)
            return Conflict(new { message = "This line has open replenishment requests. Complete them before deactivating the line." });
        var hasAssignedPallets = await _db.Pallets.AnyAsync(x => x.LineName == line.Code && x.Status == PalletStatus.OnLine);
        if (hasAssignedPallets)
            return Conflict(new { message = "This line still has pallets assigned to it. Move or consume them before deactivating the line." });
        line.IsActive = false;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Production line deactivated." });
    }

    [HttpPost("lines/{id:int}/activate")]
    public async Task<IActionResult> ActivateLine(int id)
    {
        var line = await _db.ProductionLines.FindAsync(id);
        if (line == null) return NotFound(new { message = "Production line not found." });
        line.IsActive = true;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Production line activated." });
    }
}
