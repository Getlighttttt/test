using Microsoft.AspNetCore.Mvc;
using WmsApi.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using WmsApi.Models;
using System.Security.Claims;

namespace WmsApi.Controllers
{

    [ApiController]
    [Route("api/receiving")]
    [Authorize]

    public class ReceivingController : ControllerBase
    {
        private readonly Db1Context _db;
        private readonly MovementLogger _logger;

        public ReceivingController(Db1Context db, MovementLogger logger) => (_db, _logger) = (db, logger);

        [HttpGet("order/{orderNumber}")]
        public async Task<IActionResult> GetOrder(string orderNumber)
        {
            var order = await _db.Orders.Include(o => o.Items).ThenInclude(i => i.Product).FirstOrDefaultAsync(o => o.OrderNumber == orderNumber);
            if(order == null) {
                return NotFound(new { message = "An unknown van" });
            }
            return Ok(new { orderNumber = order.OrderNumber, supplierName = order.SupplierName, items = order.Items.Select(i => new { code = i.Product.Code, name = i.Product.Name, expectedQty = i.ExpectedQty, unit = i.Product.Unit }) });
        }

        [HttpPost("receive")]
        public async Task<IActionResult> Receive(ReceiveRequest req)
        {
            var order = await _db.Orders
                .Include(o => o.Items).ThenInclude(i => i.Product)
                .FirstOrDefaultAsync(o => o.OrderNumber == req.OrderNumber);
            if (order == null)
                return NotFound(new { message = "An unknown van" });

            if (req.Pallets.Count == 0)
                return BadRequest(new { message = "No pallets" });

            var codes = req.Pallets.Select(p => p.Code);
            if (codes.Distinct().Count() < req.Pallets.Count)
                return BadRequest(new { message = "Duplicate pallet codes in the request" });

            foreach (var p in req.Pallets)
            {
                if (p.Quantity <= 0)
                    return BadRequest(new { message = $"Invalid quantity per pallet {p.Code}" });

                if (!await _db.Products.AnyAsync(x => x.Code == p.ProductCode))
                    return BadRequest(new { message = $"Unknown product: {p.ProductCode}" });

                if (await _db.Pallets.AnyAsync(x => x.Code == p.Code))
                    return BadRequest(new { message = $"Palette {p.Code} it already exists" });
            }

            var deviations = new List<string>();

            foreach (var item in order.Items)
            {
                var received = req.Pallets
                    .Where(p => p.ProductCode == item.Product!.Code)
                    .Sum(p => p.Quantity);

                if (received != item.ExpectedQty)
                    deviations.Add($"{item.Product!.Code}: expected {item.ExpectedQty}, accepted {received}");
            }

            foreach (var pallet in req.Pallets)
            {
                if (!order.Items.Any(i => i.Product!.Code == pallet.ProductCode))
                    deviations.Add($"{pallet.ProductCode} is not included in the order");
            }

            var status = deviations.Count > 0 ? "WITH_DEVIATION" : "OK";
            string? note = deviations.Count > 0 ? string.Join("\n", deviations) : null;

            // Receiving is a shared physical area; many pallets may point to LOC-REC1.
            var receivingLocation = await _db.Locations.FirstOrDefaultAsync(l =>
                l.Code == "LOC-REC1" && l.Zone == Zone.Receiving);
            if (receivingLocation == null)
                return Problem("Receiving location LOC-REC1 is missing", statusCode: 500);

            int userId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
            string? userName = User.Identity?.Name;

            var receipt = new Receipt
            {
                OrderId = order.Id,
                Status = status,
                Note = note,
                ReceivedByUserId = userId
            };
            _db.Receipts.Add(receipt);

            foreach (var p in req.Pallets)
            {
                var product = await _db.Products.FirstAsync(x => x.Code == p.ProductCode);

                var pallet = new Pallet
                {
                    Code = p.Code,
                    ProductId = product.Id,
                    Quantity = p.Quantity,
                    OrderId = order.Id,
                    Status = PalletStatus.Received,
                    LocationId = receivingLocation.Id,
                    PackagingDamaged = p.PackagingDamaged,
                    Receipt = receipt
                };
                _db.Pallets.Add(pallet);

                if (p.PackagingDamaged)
                {
                    _db.DamageRecords.Add(new DamageRecord
                    {
                        Pallet = pallet,
                        Description = p.DamageDescription ?? "",
                        UserId = userId
                    });
                }
            }

            await _db.SaveChangesAsync();

            foreach (var p in req.Pallets)
            {
                await _logger.LogAsync("RECEIVE", p.Code, p.ProductCode, p.Quantity,
                    null, Zone.Receiving, userName, note);
            }

            return Ok(new
            {
                status,
                deviations,
                receiptId = receipt.Id,
                pallets = req.Pallets.Select(p => p.Code)
            });
        }

        [HttpGet("free-locations")]
        public async Task<IActionResult> GetFreeLocations()
        {
            var locations = await _db.Locations
                .Where(l => l.Zone == Models.Zone.Storage && l.IsFree == true)
                .ToListAsync();

            return Ok(locations.Select(l => new { code = l.Code }));
        }

        [HttpPost("store")]
        public async Task<IActionResult> Store(StoreRequest req)
        {
            var pallet = await _db.Pallets.Include(p => p.Receipt).Include(p => p.Product).FirstOrDefaultAsync(p => p.Code == req.PalletCode);
            if(pallet == null)
            {
                return NotFound(new { message = "An unknown palette" });
            }

            if(pallet.Status != PalletStatus.Received)
            {
                return BadRequest(new { message = "The pallet has not been accepted" });
            }

            var location = await _db.Locations.FirstOrDefaultAsync(l => l.Code == req.LocationCode);
            if(location == null)
            {
                return NotFound(new {message = "Unknown position" });
            }

            if(pallet.Receipt != null && pallet.Receipt.Status != "OK" && pallet.Receipt.Status != "APPROVED")
            {
                return Conflict(new { message = "The pallet contains incorrect information" });
            }

            if(location.Zone != Models.Zone.Storage || location.IsFree == false)
            {
                return BadRequest(new { message = "The position is not available" });
            }

            pallet.LocationId = location.Id;
            pallet.Status = PalletStatus.Stored;
            location.IsFree = false;
            await _db.SaveChangesAsync();

            await _logger.LogAsync("STORE", req.PalletCode, pallet.Product.Code, pallet.Quantity,
                Zone.Receiving, Zone.Storage, User.Identity?.Name, req.LocationCode);

            return Ok(new {message = "The pallet was placed in the warehouse", PalletCode = req.PalletCode, LocationCode = req.LocationCode});
        }

    }
}
