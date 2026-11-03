using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using WmsApi.Data;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<Db1Context>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Db1")));
builder.Services.AddDbContext<Db2Context>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Db2")));
builder.Services.AddScoped<MovementLogger>();

// C# -> Python ML service. Uses the Docker service name inside Compose.
builder.Services.AddHttpClient("ml", client =>
{
    client.BaseAddress = new Uri(
        builder.Configuration["ML_SERVICE_URL"]
        ?? builder.Configuration["Ml:BaseUrl"]
        ?? "http://localhost:8000");

    client.DefaultRequestHeaders.Add(
        "X-API-Key",
        builder.Configuration["Ml:ApiKey"] ?? "dev-ml-key");

    client.Timeout = TimeSpan.FromSeconds(10);
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = "wms_session";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.ExpireTimeSpan = TimeSpan.FromHours(8);
        o.SlidingExpiration = true;
        o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
        o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db1 = scope.ServiceProvider.GetRequiredService<Db1Context>();
    db1.Database.EnsureCreated();
    var db2 = scope.ServiceProvider.GetRequiredService<Db2Context>();
    db2.Database.EnsureCreated();

    DbSeeder.Seed(db1);
    LocationBootstrapper.EnsureLocations(db1);
    OrderBootstrapper.Seed(db1);

    var syntheticRecords = ConsumptionBootstrapper.Seed(db2);
    if (syntheticRecords > 0)
        app.Logger.LogInformation("Seeded {Count} synthetic consumption records in DB2.", syntheticRecords);
}

app.UseSwagger();
app.UseSwaggerUI();

// Serve React frontend
app.UseDefaultFiles();
app.UseStaticFiles();

// Authentication
app.UseAuthentication();
app.UseAuthorization();

// Backend API
app.MapControllers();

// React Router support
app.MapFallbackToFile("index.html");

app.Run();
