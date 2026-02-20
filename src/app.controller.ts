import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AppService } from './app.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { PrismaService } from './prisma.service';
import { Readable } from 'stream';
import * as path from 'path';
import fs from 'fs';
import type { Request, Response } from 'express';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prismaService: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('video')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'video', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      {
        dest: './uploads',
        storage: diskStorage({
          destination: './uploads',
          filename: (
            _req: any,
            file: { originalname: any },
            cb: (arg0: null, arg1: string) => void,
          ) => {
            cb(null, `${Date.now()}-${randomUUID()}${file.originalname}`);
          },
        }),
      },
    ),
  )
  async uploadFiles(
    @Req() _req: Request,
    @Body() contentData: { title: string; description: string },
    @UploadedFiles()
    files: { video?: Express.Multer.File[]; thumbnail?: Express.Multer.File[] },
  ): Promise<any> {
    const videoFile = files.video?.[0];
    const thumbnailFile = files.thumbnail?.[0];

    if (!videoFile || !thumbnailFile) {
      throw new BadRequestException(
        'Both video and thumbnail files are required',
      );
    }

    const allowedVideoTypes = ['video/mp4'];
    const allowedImageTypes = ['image/jpeg'];

    if (!allowedVideoTypes.includes(videoFile.mimetype)) {
      fs.unlinkSync(videoFile.path);
      fs.unlinkSync(thumbnailFile.path);
      throw new BadRequestException('Only video and image files are allowed');
    }

    if (!allowedImageTypes.includes(thumbnailFile.mimetype)) {
      fs.unlinkSync(videoFile.path);
      fs.unlinkSync(thumbnailFile.path);
      throw new BadRequestException('Only video and image files are allowed');
    }

    return await this.prismaService.video.create({
      data: {
        id: randomUUID(),
        title: contentData.title,
        description: contentData.description,
        url: videoFile.path,
        thumbnailUrl: thumbnailFile.path,
        sizeInKb: Math.round(videoFile.size / 1024),
        duration: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  @Get('stream/:videoId')
  @Header('Content-Type', 'video/mp4')
  async streamVideo(
    @Param('videoId') videoId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<any> {
    const video = await this.prismaService.video.findUnique({
      where: { id: videoId },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    const videoPath = path.join('.', video.url);

    const fileSize = fs.statSync(videoPath).size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      const chunkSize = end - start + 1;
      const file = fs.createReadStream(videoPath, { start, end });

      res.writeHead(HttpStatus.PARTIAL_CONTENT, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      });

      return file.pipe(res); /// ?????
    }

    res.writeHead(HttpStatus.OK, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    });
  }
}
