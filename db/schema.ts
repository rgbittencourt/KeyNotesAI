import{integer,primaryKey,sqliteTable,text}from"drizzle-orm/sqlite-core";

export const appUsers=sqliteTable("app_users",{
 email:text("email").primaryKey(),userId:text("user_id").unique(),name:text("name"),role:text("role",{enum:["admin","user"]}).notNull().default("user"),status:text("status",{enum:["active","disabled"]}).notNull().default("active"),monthlyLimit:integer("monthly_limit").notNull().default(50),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()
});
export const apiUsage=sqliteTable("api_usage",{email:text("email").notNull().references(()=>appUsers.email,{onDelete:"cascade"}),period:text("period").notNull(),used:integer("used").notNull().default(0) },table=>[primaryKey({columns:[table.email,table.period]})]);
